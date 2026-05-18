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
            'handleInstallCancel'
        ]);
        this.state = {
            installedPackages: {},   // pkgId → true
            boardPacks: {},          // pkgId → manifest entry
            installTarget: null,     // device pending install
            installing: false,
            installError: null
        };
    }

    componentDidMount () {
        this.props.vm.extensionManager.getDeviceList().then(data => {
            this.props.onSetDeviceData(makeDeviceLibrary(data));
        })
            .catch(() => {
                this.props.onSetDeviceData(makeDeviceLibrary());
            });

        /* Load installed board status */
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
            }).catch(() => { /* no board-packs manifest — treat all as installed */ });
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
        /* If this board's package is not installed, prompt install instead */
        const pkg = item.boardPackage;
        if (pkg && this.state.installedPackages[pkg] === false) {
            this.setState({installTarget: item, installError: null});
            return;
        }
        this.requestLoadDevice(item);
        this.props.onRequestClose();
    }

    handleInstallConfirm () {
        const {installTarget, boardPacks} = this.state;
        if (!installTarget) return;
        const pkg = installTarget.boardPackage;
        const packInfo = boardPacks[pkg] || {};
        this.setState({installing: true, installError: null});

        const ipc = getIpc();
        if (!ipc) {
            this.setState({installing: false, installError: 'Not running in Electron.'});
            return;
        }

        ipc.invoke('board-manager:install', pkg).then(() => {
            this.setState(prev => ({
                installing: false,
                installedPackages: {...prev.installedPackages, [pkg]: true},
                installTarget: null
            }));
            /* Now load the device */
            this.requestLoadDevice(installTarget);
            this.props.onRequestClose();
        }).catch(err => {
            this.setState({
                installing: false,
                installError: err.message || 'Installation failed.'
            });
        });
        void packInfo;
    }

    handleInstallCancel () {
        this.setState({installTarget: null, installing: false, installError: null});
    }

    render () {
        const {installedPackages, boardPacks, installTarget, installing, installError} = this.state;
        const hasBoardPacks = Object.keys(boardPacks).length > 0;

        const deviceLibraryThumbnailData = this.props.deviceData.map(device => {
            const pkg = device.boardPackage;
            const notInstalled = hasBoardPacks && pkg &&
                installedPackages[pkg] === false;
            return {
                rawURL: device.iconURL || deviceIcon,
                ...device,
                /* Mark as not-installed so the card can render an Install badge */
                boardPackageInstalled: !notInstalled,
                /* Slightly dim not-installed cards but keep them visible + clickable */
                notInstalled
            };
        });

        return (
            <React.Fragment>
                <LibraryComponent
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
                        error={installError}
                        onConfirm={this.handleInstallConfirm}
                        onCancel={this.handleInstallCancel}
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
