import bindAll from 'lodash.bindall';
import React from 'react';
import PropTypes from 'prop-types';
import {defineMessages, intlShape, injectIntl} from 'react-intl';
import {connect} from 'react-redux';
import log from '../lib/log';
import sharedMessages from './shared-messages';
import MessageBoxType from '../lib/message-box.js';

import {
    LoadingStates,
    getIsLoadingUpload,
    getIsShowingWithoutId,
    onLoadedProject,
    requestProjectUpload
} from '../reducers/project-state';
import {setProjectTitle} from '../reducers/project-title';
import {
    openLoadingProject,
    closeLoadingProject
} from '../reducers/modals';
import {
    closeFileMenu
} from '../reducers/menus';

const messages = defineMessages({
    loadError: {
        id: 'gui.projectLoader.loadError',
        defaultMessage: 'The project file that was selected failed to load.',
        description: 'An error that displays when a local project file fails to load.'
    }
});

/**
 * Higher Order Component to provide behavior for loading local project files into editor.
 * @param {React.Component} WrappedComponent the component to add project file loading functionality to
 * @returns {React.Component} WrappedComponent with project file loading functionality added
 *
 * <SBFileUploaderHOC>
 *     <WrappedComponent />
 * </SBFileUploaderHOC>
 */
const SBFileUploaderHOC = function (WrappedComponent) {
    class SBFileUploaderComponent extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'createFileObjects',
                'getProjectTitleFromFilename',
                'handleFinishedLoadingUpload',
                'handleStartSelectingFileUpload',
                'handleChange',
                'onload',
                'removeFileObjects'
            ]);
        }
        componentDidUpdate (prevProps) {
            if (this.props.isLoadingUpload && !prevProps.isLoadingUpload) {
                this.handleFinishedLoadingUpload(); // cue step 5 below
            }
        }
        componentWillUnmount () {
            this.removeFileObjects();
        }
        // step 1: this is where the upload process begins
        handleStartSelectingFileUpload () {
            this.createFileObjects(); // go to step 2
        }
        // step 2: create a FileReader and an <input> element, and issue a
        // pseudo-click to it. That will open the file chooser dialog.
        createFileObjects () {
            // redo step 7, in case it got skipped last time and its objects are
            // still in memory
            this.removeFileObjects();
            // create fileReader
            this.fileReader = new FileReader();
            this.fileReader.onload = this.onload;
            // create <input> element and add it to DOM
            this.inputElement = document.createElement('input');
            this.inputElement.accept = '.ob,.sb,.sb2,.sb3';
            this.inputElement.style = 'display: none;';
            this.inputElement.type = 'file';
            this.inputElement.onchange = this.handleChange; // connects to step 3
            document.body.appendChild(this.inputElement);
            // simulate a click to open file chooser dialog
            this.inputElement.click();
        }
        // step 3: user has picked a file using the file chooser dialog.
        // We don't actually load the file here, we only decide whether to do so.
        async handleChange (e) {
            const {projectChanged} = this.props;
            const thisFileInput = e.target;
            if (!thisFileInput.files) return;

            this.fileToUpload = thisFileInput.files[0];

            if (projectChanged) {
                const choice = await this.showSaveBeforeOpenDialog();
                if (choice === 'cancel') {
                    this.removeFileObjects();
                    this.props.closeFileMenu();
                    return;
                }
                // 'discard' falls through — skip save, open anyway
                if (choice === 'save' && this.props.onSaveBeforeOpen) {
                    await this.props.onSaveBeforeOpen();
                }
            }

            /* If the .ob file contains a bundled ML model that has since been deleted,
               warn the user before opening so they can choose to abort. */
            const filePath = this.fileToUpload && this.fileToUpload.path;
            if (filePath && /\.ob$/i.test(filePath)) {
                let ipcForCheck = null;
                try { ipcForCheck = window.require('electron').ipcRenderer; } catch (_) { /* not in Electron */ }
                if (ipcForCheck) {
                    try {
                        const mlCheck = await ipcForCheck.invoke('ml-check-ob-model', filePath);
                        if (mlCheck && mlCheck.mlDeleted) {
                            const {dialog: remoteDialog} = window.require('@electron/remote');
                            const name = mlCheck.projectName || 'Unknown';
                            const idx = remoteDialog.showMessageBoxSync({
                                type: 'warning',
                                title: 'ML Model Not Found',
                                message: `The ML model "${name}" used in this project has been deleted.`,
                                detail: 'You can continue without ML blocks, or cancel and keep the current project.',
                                buttons: ['Continue without ML blocks', 'Cancel'],
                                defaultId: 0,
                                cancelId: 1
                            });
                            if (idx === 1) {
                                // User cancelled — abort the file open entirely
                                this.removeFileObjects();
                                this.props.closeFileMenu();
                                return;
                            }
                            // User chose "Continue without ML blocks" — set flag so onload and
                            // PROJECT_LOADED handler skip ML restoration for this file open.
                            window.__openblockMLSkipRestore = true;
                        }
                    } catch (_) { /* check failed — proceed normally, ML will load if present */ }
                }
            }

            /* Blank the workspace immediately so old blocks don't show during load */
            this.props.onLoadingStarted();
            this.props.requestProjectUpload(this.props.loadingState);
            this.props.closeFileMenu();
        }

        /* Returns a promise resolving to 'save', 'discard', or 'cancel'. */
        showSaveBeforeOpenDialog () {
            return new Promise(resolve => {
                try {
                    const {dialog} = window.require('@electron/remote');
                    // 0 = Save & Open, 1 = Don't Save, 2 = Cancel
                    const idx = dialog.showMessageBoxSync({
                        type: 'question',
                        buttons: ['Save & Open', "Don't Save", 'Cancel'],
                        defaultId: 0,
                        cancelId: 2,
                        title: 'Unsaved Changes',
                        message: 'You have unsaved changes.',
                        detail: 'Save your project before opening another?'
                    });
                    if (idx === 0) resolve('save');
                    else if (idx === 1) resolve('discard');
                    else resolve('cancel');
                } catch (_) {
                    /* Fallback for non-Electron environments */
                    resolve(window.confirm('Save your project before opening another?') ? 'save' : 'discard');
                }
            });
        }
        // step 4 is below, in mapDispatchToProps

        // step 5: called from componentDidUpdate when project state shows
        // that project data has finished "uploading" into the browser
        handleFinishedLoadingUpload () {
            if (this.fileToUpload && this.fileReader) {
                // Wire up progress so the loading overlay shows real feedback for large files
                this.fileReader.onprogress = e => {
                    if (e.lengthComputable && e.total > 0) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        log.log(`[sb-file-uploader] Reading file: ${pct}%`);
                    }
                };
                this.fileReader.readAsArrayBuffer(this.fileToUpload);
            } else {
                this.props.cancelFileUpload(this.props.loadingState);
                // skip ahead to step 7
                this.removeFileObjects();
            }
        }
        // used in step 6 below
        getProjectTitleFromFilename (fileInputFilename) {
            if (!fileInputFilename) return '';
            // parse title from all supported extensions: .ob, .sb, .sb2, .sb3
            const matches = fileInputFilename.match(/^(.*)\.(ob|sb[23]?)$/i);
            if (!matches) return '';
            return matches[1].substring(0, 100); // truncate project title to max 100 chars
        }
        // step 6: attached as a handler on our FileReader object; called when
        // file upload raw data is available in the reader
        async onload () {
            if (this.fileReader) {
                this.props.onLoadingStarted();
                const filename = this.fileToUpload && this.fileToUpload.name;
                let _mlIpc = null;
                /* Inform main process of the opened file path so ML data can be extracted */
                try {
                    const filePath = this.fileToUpload && this.fileToUpload.path;
                    if (filePath && /\.(ob|sb3?)$/i.test(filePath)) {
                        const {ipcRenderer: ipc} = window.require('electron');
                        _mlIpc = ipc;
                        ipc.send('ml-update-current-file', filePath);
                        const fileTitle = this.getProjectTitleFromFilename(filename);
                        ipc.invoke('add-recent-file', filePath, fileTitle).catch(() => {});
                    }
                } catch (_) { /* not in Electron */ }
                // Validate file before passing to VM: must be a ZIP (PK magic) or JSON
                const result = this.fileReader.result;
                const header = new Uint8Array(result instanceof ArrayBuffer ? result : new ArrayBuffer(0), 0, 4);
                const isZip  = header[0] === 0x50 && header[1] === 0x4B; // PK magic
                const isJson = (function () {
                    try {
                        const text = new TextDecoder().decode(new Uint8Array(result, 0, Math.min(4096, result.byteLength)));
                        return text.trimStart().startsWith('{');
                    } catch (_) { return false; }
                }());
                if (!isZip && !isJson) {
                    log.warn('[sb-file-uploader] Rejected file with unrecognized format:', filename);
                    this.props.onShowMessageBox(MessageBoxType.alert,
                        `This file doesn't appear to be a valid project file (.ob, .sb3).\n\nPlease choose a valid project file.`
                    );
                    this.props.onLoadingFinished(this.props.loadingState, false);
                    this.removeFileObjects();
                    return;
                }
                // Pre-populate window.__openblockMLModel so the teachableMachine extension
                // initialises with the correct block type (text/image/sounds) when the
                // project loads, preventing image blocks appearing for text/audio models.
                // Skip if the user chose "Continue without ML blocks" for a deleted model.
                if (_mlIpc && !window.__openblockMLSkipRestore) {
                    try {
                        const meta = await _mlIpc.invoke('ml-preload-active-model');
                        if (meta && meta.type && !meta.noMlData) {
                            window.__openblockMLModel = {
                                projectId: meta.id,
                                projectName: meta.name,
                                type: meta.type,
                                labels: meta.labels || [],
                                trainingStatus: meta.trained ? 'ready' : 'idle'
                            };
                        }
                    } catch (_) { /* preload failed; model will be set by training page on visit */ }
                }
                let loadingSuccess = false;
                this.props.vm.loadProject(result)
                    .then(() => {
                        if (filename) {
                            const uploadedProjectTitle = this.getProjectTitleFromFilename(filename);
                            this.props.onSetProjectTitle(uploadedProjectTitle);
                        }
                        loadingSuccess = true;
                    })
                    .catch(error => {
                        log.warn('[sb-file-uploader] loadProject failed:', error);
                        this.props.onShowMessageBox(MessageBoxType.alert,
                            `${this.props.intl.formatMessage(messages.loadError)}\n${error}`);
                    })
                    .then(() => {
                        this.props.onLoadingFinished(this.props.loadingState, loadingSuccess);
                        // go back to step 7: whether project loading succeeded
                        // or failed, reset file objects
                        this.removeFileObjects();
                    });
            }
        }
        // step 7: remove the <input> element from the DOM and clear reader and
        // fileToUpload reference, so those objects can be garbage collected
        removeFileObjects () {
            if (this.inputElement) {
                this.inputElement.value = null;
                document.body.removeChild(this.inputElement);
            }
            this.inputElement = null;
            this.fileReader = null;
            this.fileToUpload = null;
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                cancelFileUpload,
                closeFileMenu: closeFileMenuProp,
                isLoadingUpload,
                isShowingWithoutId,
                loadingState,
                onLoadingFinished,
                onLoadingStarted,
                onSaveBeforeOpen,
                onSetProjectTitle,
                projectChanged,
                requestProjectUpload: requestProjectUploadProp,
                userOwnsProject,
                /* eslint-enable no-unused-vars */
                ...componentProps
            } = this.props;
            return (
                <React.Fragment>
                    <WrappedComponent
                        onStartSelectingFileUpload={this.handleStartSelectingFileUpload}
                        {...componentProps}
                    />
                </React.Fragment>
            );
        }
    }

    SBFileUploaderComponent.propTypes = {
        canSave: PropTypes.bool,
        cancelFileUpload: PropTypes.func,
        closeFileMenu: PropTypes.func,
        intl: intlShape.isRequired,
        isLoadingUpload: PropTypes.bool,
        isShowingWithoutId: PropTypes.bool,
        loadingState: PropTypes.oneOf(LoadingStates),
        onLoadingFinished: PropTypes.func,
        onLoadingStarted: PropTypes.func,
        onSaveBeforeOpen: PropTypes.func,
        onSetProjectTitle: PropTypes.func,
        onShowMessageBox: PropTypes.func.isRequired,
        projectChanged: PropTypes.bool,
        requestProjectUpload: PropTypes.func,
        userOwnsProject: PropTypes.bool,
        vm: PropTypes.shape({
            loadProject: PropTypes.func
        })
    };
    const mapStateToProps = (state, ownProps) => {
        const loadingState = state.scratchGui.projectState.loadingState;
        const user = state.session && state.session.session && state.session.session.user;
        return {
            isLoadingUpload: getIsLoadingUpload(loadingState),
            isShowingWithoutId: getIsShowingWithoutId(loadingState),
            loadingState: loadingState,
            projectChanged: state.scratchGui.projectChanged,
            userOwnsProject: ownProps.authorUsername && user &&
                (ownProps.authorUsername === user.username),
            vm: state.scratchGui.vm
        };
    };
    const mapDispatchToProps = (dispatch, ownProps) => ({
        cancelFileUpload: loadingState => {
            dispatch(onLoadedProject(loadingState, false, false));
            dispatch(closeLoadingProject());
        },
        closeFileMenu: () => dispatch(closeFileMenu()),
        // transition project state from loading to regular, and close
        // loading screen and file menu
        onLoadingFinished: (loadingState, success) => {
            const action = onLoadedProject(loadingState, ownProps.canSave, success);
            if (action) dispatch(action);
            dispatch(closeLoadingProject());
            dispatch(closeFileMenu());
        },
        // show project loading screen
        onLoadingStarted: () => dispatch(openLoadingProject()),
        onSetProjectTitle: title => dispatch(setProjectTitle(title)),
        // step 4: transition the project state so we're ready to handle the new
        // project data. When this is done, the project state transition will be
        // noticed by componentDidUpdate()
        requestProjectUpload: loadingState => dispatch(requestProjectUpload(loadingState))
    });
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(SBFileUploaderComponent));
};

export {
    SBFileUploaderHOC as default
};
