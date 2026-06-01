import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'openblock-vm';
import {connect} from 'react-redux';
import {compose} from 'redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import analytics from '../lib/analytics';
import {setDeviceData} from '../reducers/device-data';

import {makeDeviceLibrary} from '../lib/libraries/devices/index.jsx';

import LibraryComponent from '../components/library/library.jsx';
import deviceIcon from '../components/action-menu/icon--sprite.svg';
import BoardInstallModal from '../components/board-install-modal/board-install-modal.jsx';

const messages = defineMessages({
    deviceTitle: {
        defaultMessage: 'Choose an Device',
        description: 'Heading for the device library',
        id: 'gui.deviceLibrary.chooseADevice'
    },
    deviceUrl: {
        defaultMessage: 'Enter the URL of the device',
        description: 'Prompt for unoffical device url',
        id: 'gui.deviceLibrary.deviceUrl'
    },
    arduinoTag: {
        defaultMessage: 'Arduino',
        description: 'Arduino tag to filter all arduino devices.',
        id: 'gui.deviceLibrary.arduinoTag'
    },
    microPythonTag: {
        defaultMessage: 'MicroPython',
        description: 'Micro python tag to filter all micro python devices.',
        id: 'gui.deviceLibrary.microPythonTag'
    },
    kitTag: {
        defaultMessage: 'Kit',
        description: 'Kit tag to filter all kit devices.',
        id: 'gui.deviceLibrary.kitTag'
    }
});

const ARDUINO_TAG = {tag: 'Arduino', intlLabel: messages.arduinoTag};
const MICROPYTHON_TAG = {tag: 'MicroPython', intlLabel: messages.microPythonTag};
const KIT_TAG = {tag: 'Kit', intlLabel: messages.kitTag};
const tagListPrefix = [ARDUINO_TAG, MICROPYTHON_TAG, KIT_TAG];

const getIpc = () => {
    try { return window.require('electron').ipcRenderer; } catch (_) { return null; }
};

class DeviceLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect',
            'requestLoadDevice',
            'handleInstallConfirm',
            'handleInstallCancel',
            'handleInstallBackground',
            'handleCancelInstall',
            'handleProgress'
        ]);
        this.state = {
            installedPackages: {},   // pkgId → true | false
            boardPacks: {},          // pkgId → manifest entry
            installTarget: null,     // device whose install modal is open
            installing: false,
            installProgress: 0,      // 0-100
            installError: null
        };
        /* pkgId of the installation that is running but whose modal was dismissed */
        this._backgroundPkg = null;
        this._installPromise = null;
    }

    componentDidMount () {
        this.props.vm.extensionManager.getDeviceList().then(data => {
            this.props.onSetDeviceData(makeDeviceLibrary(data));
        })
            .catch(() => {
                this.props.onSetDeviceData(makeDeviceLibrary());
            });

        const ipc = getIpc();
        if (ipc) {
            ipc.invoke('board-manager:list').then(packs => {
                const installedPackages = {};
                const boardPacks = {};
                packs.forEach(p => {
                    installedPackages[p.pkgId] = p.installed;
                    boardPacks[p.pkgId] = p;
                });
                this.setState({installedPackages, boardPacks});
            }).catch(() => {});

            /* Listen for progress events sent by the main process */
            ipc.on('board-manager:progress', this.handleProgress);
        }
    }

    componentWillUnmount () {
        const ipc = getIpc();
        if (ipc) ipc.removeListener('board-manager:progress', this.handleProgress);
    }

    handleProgress (event, {pkgId, percent, done, error}) {
        if (done) {
            this.setState(prev => ({
                installedPackages: {...prev.installedPackages, [pkgId]: true},
                installing: prev.installTarget && prev.installTarget.boardPackage === pkgId
                    ? false : prev.installing,
                installProgress: 100
            }));
            /* Auto-load if this package's device was chosen and modal is still open */
            const {installTarget} = this.state;
            if (installTarget && installTarget.boardPackage === pkgId) {
                this.requestLoadDevice(installTarget);
                this.setState({installTarget: null});
                this.props.onRequestClose();
            }
            return;
        }
        if (error) {
            this.setState(prev => ({
                installing: prev.installTarget && prev.installTarget.boardPackage === pkgId
                    ? false : prev.installing,
                installError: error,
                installProgress: 0
            }));
            return;
        }
        if (this.state.installTarget && this.state.installTarget.boardPackage === pkgId) {
            this.setState({installProgress: percent || 0});
        }
    }

    requestLoadDevice (device) {
        const id = device.deviceId;
        const deviceExtensions = device.deviceExtensions;

        if (id && !device.disabled) {
            if (this.props.vm.extensionManager.isDeviceLoaded(id)) {
                this.props.onDeviceSelected(id);
            } else {
                this.props.vm.extensionManager.loadDeviceURL(device).then(() => {
                    this.props.vm.extensionManager.getDeviceExtensionsList().then(() => {
                        this.props.vm.installDeviceExtensions(Object.assign([], deviceExtensions));
                    });
                    this.props.onDeviceSelected(id);
                    analytics.event({
                        category: 'devices',
                        action: 'select device',
                        label: id
                    });
                })
                    .catch(err =>
                        console.error(err) // eslint-disable-line no-console
                    );
            }
        }
    }

    handleItemSelect (item) {
        const pkg = item.boardPackage;
        if (pkg && this.state.installedPackages[pkg] === false) {
            this.setState({installTarget: item, installError: null, installProgress: 0});
            return;
        }
        this.requestLoadDevice(item);
        this.props.onRequestClose();
    }

    handleInstallConfirm () {
        const {installTarget, boardPacks} = this.state;
        if (!installTarget) return;
        const pkg = installTarget.boardPackage;
        this.setState({installing: true, installError: null, installProgress: 0});

        const ipc = getIpc();
        if (!ipc) {
            this.setState({installing: false, installError: 'Not running in Electron.'});
            return;
        }

        /* Start installation — main process sends progress events back */
        ipc.invoke('board-manager:install', pkg).catch(err => {
            /* Only show error if the modal is still open for this package */
            if (this.state.installTarget && this.state.installTarget.boardPackage === pkg) {
                this.setState({
                    installing: false,
                    installError: err.message || 'Installation failed.'
                });
            }
        });

        void boardPacks;
    }

    /* Dismiss the modal but keep the installation running */
    handleInstallBackground () {
        const {installTarget} = this.state;
        if (installTarget) this._backgroundPkg = installTarget.boardPackage;
        this.setState({installTarget: null, installing: false, installProgress: 0, installError: null});
        /* Library stays open so the user can pick a different device */
    }

    /* Cancel the running installation */
    handleCancelInstall () {
        const {installTarget} = this.state;
        const pkg = installTarget ? installTarget.boardPackage : this._backgroundPkg;
        if (!pkg) return;

        const ipc = getIpc();
        if (ipc) ipc.invoke('board-manager:cancel', pkg).catch(() => {});

        this.setState({
            installing: false,
            installTarget: null,
            installProgress: 0,
            installError: null
        });
        this._backgroundPkg = null;
    }

    handleInstallCancel () {
        this.setState({installTarget: null, installing: false, installProgress: 0, installError: null});
    }

    render () {
        const {installedPackages, boardPacks, installTarget, installing,
            installProgress, installError} = this.state;
        const hasBoardPacks = Object.keys(boardPacks).length > 0;

        const deviceLibraryThumbnailData = this.props.deviceData.map(device => {
            const pkg = device.boardPackage;
            const notInstalled = hasBoardPacks && pkg &&
                installedPackages[pkg] === false;
            return {
                rawURL: device.iconURL || deviceIcon,
                ...device,
                boardPackageInstalled: !notInstalled,
                notInstalled
            };
        });

        return (
            <React.Fragment>
                <LibraryComponent
                    autoClose={false}
                    data={deviceLibraryThumbnailData}
                    filterable
                    tags={tagListPrefix}
                    id="deviceLibrary"
                    title={this.props.intl.formatMessage(messages.deviceTitle)}
                    onItemSelected={this.handleItemSelect}
                    onRequestClose={this.props.onRequestClose}
                />
                {installTarget && (
                    <BoardInstallModal
                        deviceName={installTarget.name}
                        packageName={boardPacks[installTarget.boardPackage]
                            ? boardPacks[installTarget.boardPackage].name
                            : installTarget.boardPackage}
                        packageSizeMB={boardPacks[installTarget.boardPackage]
                            ? Math.round(boardPacks[installTarget.boardPackage].rawBytes / 1024 / 1024)
                            : null}
                        installing={installing}
                        progress={installProgress}
                        error={installError}
                        onConfirm={this.handleInstallConfirm}
                        onCancel={this.handleInstallCancel}
                        onCancelInstall={installing ? this.handleCancelInstall : null}
                        onBackground={installing ? this.handleInstallBackground : null}
                    />
                )}
            </React.Fragment>
        );
    }
}

DeviceLibrary.propTypes = {
    deviceData: PropTypes.instanceOf(Array).isRequired,
    intl: intlShape.isRequired,
    onDeviceSelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    onSetDeviceData: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

const mapStateToProps = state => ({
    deviceData: state.scratchGui.deviceData.deviceData
});

const mapDispatchToProps = dispatch => ({
    onSetDeviceData: data => dispatch(setDeviceData(data))
});

export default compose(
    injectIntl,
    connect(
        mapStateToProps,
        mapDispatchToProps
    )
)(DeviceLibrary);
