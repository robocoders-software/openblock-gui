import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React, {useState, useCallback, useEffect, useRef} from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'openblock-vm';
import Renderer from 'scratch-render';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';
import Hardware from '../../containers/hardware.jsx';
import HardwareHeader from '../../containers/hardware-header.jsx';

// eslint-disable-next-line no-unused-vars
import Backpack from '../../containers/backpack.jsx';
import WebGlModal from '../../containers/webgl-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import UploadProgress from '../../containers/upload-progress.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';
import UpdateModal from '../../containers/update-modal.jsx';

import layout, {STAGE_SIZE_MODES} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';

import styles from './gui.css';
import {
    MLProjectsPage, MLTrainingPage, CreateProjectModal,
    deleteProjectFS,
    setActiveModel,
    loadImageProject, loadAudioProject, loadTextProject
} from 'openblock-ml-studio';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from './icon--code.svg';
import costumesIcon from './icon--costumes.svg';
import soundsIcon from './icon--sounds.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

// Cache this value to only retrieve it once the first time.
// Assume that it doesn't change for a session.
let isRendererSupported = null;

const GUIComponent = props => {
    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        // eslint-disable-next-line no-unused-vars
        backpackHost,
        // eslint-disable-next-line no-unused-vars
        backpackVisible,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        uploadProgressVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        updateModalVisible,
        enableCommunity,
        intl,
        isCreating,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isTelemetryEnabled,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onAbortUpdate,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateMLTab,
        onActivateBlocksTab,
        onActivateTab,
        mlTabVisible,
        onClickLogo,
        onClickCheckUpdate,
        onClickUpdate,
        onClickClearCache,
        onClickInstallDriver,
        // eslint-disable-next-line no-unused-vars
        onClickDevicePermissions,
        onExtensionButtonClick,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onShowMessageBox,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        showComingSoon,
        soundsTabVisible,
        stageSizeMode,
        targetIsStage,
        telemetryModalVisible,
        tipsLibraryVisible,
        vm,
        isRealtimeMode,
        isScratchDesktop,
        onDirectSave,
        // eslint-disable-next-line no-unused-vars
        projectDirty,
        // eslint-disable-next-line no-unused-vars
        lastSavedAt,
        // eslint-disable-next-line no-unused-vars
        onProjectDirtyChanged,
        // eslint-disable-next-line no-unused-vars
        onClickNew,
        // eslint-disable-next-line no-unused-vars
        onNewBlocksProject,
        // eslint-disable-next-line no-unused-vars
        onNewRoboticsProject,
        onGoHome,
        onCancelLoader,
        ...componentProps
    } = omit(props, 'dispatch');
    /* ── ML project helpers (defined before hooks) ── */
    const ML_STORAGE_KEY = 'robocoders_ml_projects';
    const loadMLProjects = () => {
        try { return JSON.parse(localStorage.getItem(ML_STORAGE_KEY) || '[]'); }
        catch (_) { return []; }
    };
    const saveMLProjects = ps => {
        try { localStorage.setItem(ML_STORAGE_KEY, JSON.stringify(ps)); }
        catch (_) { /* quota */ }
    };
    const genMLId = () => Math.random().toString(36).slice(2, 10);

    /* ── All hooks at the top level (before any conditional returns) ── */
    const [mlBlocksLoading, setMlBlocksLoading] = useState(false);
    // Set when user clicks "Use in Blocks"; cleared by the useEffect below once
    // the blocks tab is actually visible in the DOM and Blockly has been painted.
    const pendingMLSwitchRef = useRef(false);
    const [mlProjects,      setMlProjects]     = useState(loadMLProjects);
    const [mlView,          setMlView]         = useState('projects');
    const [activeMLProject, setActiveMLProject] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const createMLProject = useCallback(({name, type}) => {
        const p = {
            id: genMLId(), name, type,
            labels: ['Class 1', 'Class 2'],
            trainingData: {}, trained: false,
            createdAt: Date.now(), updatedAt: Date.now()
        };
        setMlProjects(prev => { const next = [...prev, p]; saveMLProjects(next); return next; });
        setShowCreateModal(false);
        setActiveMLProject(p);
        setMlView('training');
    }, []);

    const deleteMLProject = useCallback(projectOrId => {
        const id = typeof projectOrId === 'string' ? projectOrId : projectOrId.id;
        setMlProjects(prev => { const next = prev.filter(p => p.id !== id); saveMLProjects(next); return next; });
        if (activeMLProject && activeMLProject.id === id) {
            setActiveMLProject(null);
            setMlView('projects');
        }
        deleteProjectFS(id).catch(() => {});
        // Clear pending project in main process so will-download doesn't try to bundle deleted dir
        try {
            const ipc = window.require && window.require('electron').ipcRenderer;
            if (ipc) ipc.send('ml-clear-pending-project', id);
        } catch (_) { /* not in Electron */ }
        if (window.__openblockMLModel && window.__openblockMLModel.projectId === id) {
            setActiveModel(null);
            // Notify app.jsx so it clears savedMLModelRef and won't restore this model on Back
            window.dispatchEvent(new CustomEvent('robocoders:ml-model-deleted', {detail: {projectId: id}}));
        }
    }, [activeMLProject]);

    const importMLProject = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,.mlproject';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                try {
                    const p = JSON.parse(evt.target.result);
                    if (!p.name || !p.type) throw new Error('Invalid project file');
                    const imported = {
                        ...p,
                        id: genMLId(),
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                        trained: false,
                        trainingData: {}
                    };
                    setMlProjects(prev => {
                        const next = [...prev, imported];
                        saveMLProjects(next);
                        return next;
                    });
                    setActiveMLProject(imported);
                    setMlView('training');
                } catch (err) {
                    console.error('[MLStudio] Import failed:', err);
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, []);

    const updateMLProject = useCallback(updated => {
        setMlProjects(prev => {
            const next = prev.map(p => p.id === updated.id ? updated : p);
            saveMLProjects(next);
            return next;
        });
        setActiveMLProject(updated);
    }, []);

    useEffect(() => { saveMLProjects(mlProjects); }, [mlProjects]);

    // Re-sync with localStorage when ML tab becomes visible so that projects
    // created in the full-screen ML Studio (app.jsx) are reflected here.
    useEffect(() => {
        if (mlTabVisible) setMlProjects(loadMLProjects());
    }, [mlTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear transient ML loading state when the desktop starts a fresh blocks project.
    // ML project list and the active training view are intentionally preserved —
    // the user's projects stay intact; they can re-export a model if needed.
    useEffect(() => {
        const handler = () => {
            setMlBlocksLoading(false);
            pendingMLSwitchRef.current = false;
        };
        window.addEventListener('robocoders:new-project', handler);
        return () => window.removeEventListener('robocoders:new-project', handler);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load/unload teachableMachine as the ML tab opens or closes.
    // Pre-load on open so "Use in Blocks" is instant; unload on close only if
    // the user didn't export a model AND the project has no existing ML blocks
    // (i.e. the extension wasn't part of the saved project).
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;
        if (mlTabVisible) {
            if (!vm.extensionManager.isExtensionLoaded('teachableMachine')) {
                vm.extensionManager.loadExtensionURL('teachableMachine')
                    .catch(e => console.warn('[ML] extension pre-load failed:', e));
            }
        } else if (vm.extensionManager.isExtensionLoaded('teachableMachine') &&
                   !window.__openblockMLModel) {
            // No active model — unload regardless of workspace blocks.
            // Keeping the extension alive with no model makes blocks appear functional but broken.
            vm.extensionManager.unloadExtension('teachableMachine');
        }
    }, [mlTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    // When the user clicks "← Back" in the full-screen ML Studio:
    // • No model (null) → unload extension unconditionally. The model is gone (deleted or
    //   never exported), so any workspace blocks that reference it are non-functional.
    //   Unloading turns them into "unknown" blocks — a clear signal to the user.
    // • Model present → keep extension and refresh so Blockly re-measures block text.
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;
        const handler = () => {
            if (!vm.extensionManager.isExtensionLoaded('teachableMachine')) return;
            if (!window.__openblockMLModel) {
                vm.extensionManager.unloadExtension('teachableMachine');
                return;
            }
            // Extension stays loaded — do a delayed refresh so Blockly has time to
            // measure SVG text after the blocks panel becomes visible again.
            setTimeout(() => {
                vm.extensionManager.refreshBlocks()
                    .catch(() => {})
                    .finally(() => { if (vm.editingTarget) vm.refreshWorkspace(); });
                setTimeout(() => vm.extensionManager.refreshBlocks().catch(() => {}), 400);
            }, 300);
        };
        window.addEventListener('robocoders:ml-back', handler);
        return () => window.removeEventListener('robocoders:ml-back', handler);
    }, [vm]); // eslint-disable-line react-hooks/exhaustive-deps

    // Desktop path: when WrappedGui first mounts after an ML export OR when a .ob file
    // with embedded ML data is opened, pre-populate window.__openblockMLModel from the
    // ZIP's ml/*/project.json so the extension loads with the correct block type.
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;
        if (vm.extensionManager.isExtensionLoaded('teachableMachine')) return;

        let cancelled = false;
        let targetsListener = null;

        const doLoad = () => {
            if (cancelled) return;
            vm.extensionManager.loadExtensionURL('teachableMachine')
                .then(() => vm.extensionManager.refreshBlocks())
                .catch(e => console.warn('[ML] auto-load failed:', e));
        };

        const scheduleLoad = () => {
            if (cancelled) return;
            if (vm.runtime.targets && vm.runtime.targets.length > 0) {
                doLoad();
            } else {
                targetsListener = () => {
                    vm.removeListener('targetsUpdate', targetsListener);
                    targetsListener = null;
                    doLoad();
                };
                vm.addListener('targetsUpdate', targetsListener);
            }
        };

        (async () => {
            // If not set yet, try reading ML metadata from the currently open .ob file.
            if (!window.__openblockMLModel) {
                try {
                    const ipc = window.require && window.require('electron').ipcRenderer;
                    if (ipc) {
                        const meta = await ipc.invoke('ml-preload-active-model');
                        if (!cancelled && meta && meta.type && !meta.noMlData) {
                            window.__openblockMLModel = {
                                projectId: meta.id,
                                projectName: meta.name,
                                type: meta.type,
                                labels: meta.labels || [],
                                trainingStatus: meta.trained ? 'ready' : 'idle'
                            };
                        }
                    }
                } catch (_) { /* not in Electron context */ }
            }
            if (!cancelled && window.__openblockMLModel) {
                scheduleLoad();
            }
        })();

        return () => {
            cancelled = true;
            if (targetsListener) vm.removeListener('targetsUpdate', targetsListener);
        };
    }, [vm]); // eslint-disable-line react-hooks/exhaustive-deps

    // After every project load: verify that ML model data exists in the .ob file.
    // If teachableMachine was serialised into the project (from a prior "Use in Blocks") but
    // the bundled ml/ data is gone (project deleted, or never bundled), unload the extension
    // so the workspace blocks appear as "unknown" — a clear visual signal to the user.
    // If the data IS present, set window.__openblockMLModel so the correct block set shows.
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;

        const handler = async () => {
            // If app.jsx queued a new-project-for-export, trigger it now that the
            // blank project is fully loaded — this avoids the race where PROJECT_LOADED
            // fires after the export event and clears the model, compressing the blocks.
            if (typeof window.__openblockMLPendingExport !== 'undefined') {
                const pendingModel = window.__openblockMLPendingExport;
                delete window.__openblockMLPendingExport;
                if (pendingModel) window.__openblockMLModel = pendingModel;
                window.dispatchEvent(new CustomEvent('robocoders:ml-export-to-blocks'));
                return;
            }

            // User chose "Continue without ML blocks" for a .ob file whose ML project was deleted.
            // Unload the extension so blocks turn unknown/grey — do NOT call loadXxxProject
            // (which would re-extract ml/ from the .ob, silently restoring the deleted project).
            if (window.__openblockMLSkipRestore) {
                window.__openblockMLSkipRestore = false;
                setActiveModel(null);
                if (vm.extensionManager.isExtensionLoaded('teachableMachine')) {
                    vm.extensionManager.unloadExtension('teachableMachine');
                }
                return;
            }

            if (!vm.extensionManager.isExtensionLoaded('teachableMachine')) return;
            try {
                const ipc = window.require && window.require('electron').ipcRenderer;
                if (!ipc) return;
                const meta = await ipc.invoke('ml-preload-active-model');
                if (meta && meta.type && !meta.noMlData) {
                    // Set minimal metadata immediately so blocks render the correct type/labels
                    if (!window.__openblockMLModel) {
                        setActiveModel({
                            projectId:      meta.id,
                            projectName:    meta.name,
                            type:           meta.type,
                            labels:         meta.labels || [],
                            trainingStatus: meta.trained ? 'ready' : 'idle'
                        });
                    }
                    vm.extensionManager.refreshBlocks().catch(() => {});
                    // Asynchronously load the full classifier so predictions work immediately.
                    // Skip if the model is already fully loaded (same session, same file re-opened).
                    const alreadyFull = window.__openblockMLModel && (
                        window.__openblockMLModel.classifier ||
                        window.__openblockMLModel.classifyText ||
                        window.__openblockMLModel.startListening
                    );
                    if (meta.trained && meta.id && !alreadyFull) {
                        const t = meta.type;
                        const afterLoad = () => vm.extensionManager.refreshBlocks().catch(() => {});
                        if (t === 'images' || t === 'image') {
                            loadImageProject(meta.id).then(afterLoad).catch(() => {});
                        } else if (t === 'sounds') {
                            loadAudioProject(meta.id).then(afterLoad).catch(() => {});
                        } else if (t === 'text') {
                            loadTextProject(meta.id).then(afterLoad).catch(() => {});
                        }
                    }
                } else {
                    // No ML data in this file — unload so blocks turn "unknown" (model missing)
                    setActiveModel(null);
                    vm.extensionManager.unloadExtension('teachableMachine');
                }
            } catch (_) { /* not in Electron */ }
        };

        vm.runtime.on('PROJECT_LOADED', handler);
        return () => vm.runtime.removeListener('PROJECT_LOADED', handler);
    }, [vm]); // eslint-disable-line react-hooks/exhaustive-deps

    // When blocks tab becomes visible and teachableMachine is loaded, force a toolbox refresh.
    // 300ms gives Blockly enough time to measure SVG text with the container fully laid out,
    // preventing the compressed/truncated block rendering bug on project reopen.
    useEffect(() => {
        if (!blocksTabVisible || !vm || !vm.extensionManager) return;
        if (!vm.extensionManager.isExtensionLoaded('teachableMachine')) return;
        const refresh = () => {
            vm.extensionManager.refreshBlocks()
                .catch(() => {})
                .finally(() => {
                    // After refreshBlocks, force workspace rebuild so toolbox picks up ML blocks
                    if (vm.editingTarget) vm.refreshWorkspace();
                });
        };
        const t1 = setTimeout(refresh, 300);
        // Second pass in case the first fires before layout settles
        const t2 = setTimeout(refresh, 700);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [blocksTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Complete a pending "Use in Blocks" export once the blocks panel is actually
    // painted and Blockly's container has real dimensions.
    //
    // useEffect runs after React has committed the DOM, so display:none is already
    // removed from the blocks panel when this fires — safe to call refreshBlocks().
    useEffect(() => {
        if (!pendingMLSwitchRef.current) return;
        if (!blocksTabVisible) return;
        if (!vm || !vm.extensionManager) return;
        pendingMLSwitchRef.current = false;

        const doRefresh = () => {
            // refreshBlocks() fires _refreshExtensionPrimitives via a fire-and-forget
            // dispatch.call — it resolves before BLOCKSINFO_UPDATE is emitted.
            // After it returns, explicitly call refreshWorkspace() so that
            // onWorkspaceUpdate() → getToolboxXML() → updateToolboxState() runs with
            // the freshly-populated _blockInfo, guaranteeing the toolbox is rebuilt.
            vm.extensionManager.refreshBlocks()
                .catch(() => {})
                .finally(() => {
                    setTimeout(() => {
                        // Force workspace update so Blocks container rebuilds toolbox
                        // from _blockInfo which now includes the ML extension.
                        if (vm.editingTarget) {
                            vm.refreshWorkspace();
                        }
                        // Second refreshBlocks pass for safety
                        setTimeout(() => {
                            vm.extensionManager.refreshBlocks().catch(() => {});
                            setMlBlocksLoading(false);
                        }, 300);
                    }, 100);
                });
        };

        // Force unload → reload so re-exporting a different model type doesn't
        // merge old and new blocks in the toolbox.
        const loadAndRefresh = () => {
            vm.extensionManager.loadExtensionURL('teachableMachine')
                .then(() => setTimeout(doRefresh, 150))
                .catch(e => {
                    console.warn('[ML] extension load failed:', e);
                    setMlBlocksLoading(false);
                });
        };

        if (vm.extensionManager.isExtensionLoaded('teachableMachine')) {
            try { vm.extensionManager.unloadExtension('teachableMachine'); } catch (_) {}
            setTimeout(loadAndRefresh, 100);
        } else {
            loadAndRefresh();
        }
    }, [blocksTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle "Use in Blocks" from the standalone MLStudioApp when WrappedGui is already
    // alive. app.jsx dispatches robocoders:ml-export-to-blocks so we can reload the
    // extension cleanly without resetting the project.
    // We always UNLOAD then RELOAD the extension so that stale block definitions from a
    // previous export (different model type or labels) are fully cleared before the new
    // ones are registered — prevents image+text blocks merging in the toolbox.
    useEffect(() => {
        const handler = () => {
            if (!vm || !vm.extensionManager) return;
            setMlBlocksLoading(true);

            const doRefresh = () => {
                vm.extensionManager.refreshBlocks()
                    .catch(() => {})
                    .finally(() => {
                        setTimeout(() => {
                            if (vm.editingTarget) vm.refreshWorkspace();
                            setTimeout(() => {
                                vm.extensionManager.refreshBlocks().catch(() => {});
                                setMlBlocksLoading(false);
                            }, 300);
                        }, 100);
                    });
            };

            const loadAndRefresh = () => {
                vm.extensionManager.loadExtensionURL('teachableMachine')
                    .then(() => setTimeout(doRefresh, 150))
                    .catch(e => {
                        console.warn('[ML] export-to-blocks load failed:', e);
                        setMlBlocksLoading(false);
                    });
            };

            // Force a clean unload → reload cycle every time so the toolbox only
            // contains the current model's blocks (avoids merging on re-export).
            if (vm.extensionManager.isExtensionLoaded('teachableMachine')) {
                try { vm.extensionManager.unloadExtension('teachableMachine'); } catch (_) {}
                setTimeout(loadAndRefresh, 100);
            } else {
                loadAndRefresh();
            }
        };
        window.addEventListener('robocoders:ml-export-to-blocks', handler);
        return () => window.removeEventListener('robocoders:ml-export-to-blocks', handler);
    }, [vm]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Early return for children prop (after all hooks) ── */
    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    // Mark that we need to load the ML extension into Blockly, then switch to the
    // blocks tab.  The actual extension load + refreshBlocks happens in the useEffect
    // above, which runs after React has painted the blocks panel — guaranteeing that
    // Blockly's container has real dimensions before we measure SVG text.
    const loadMLExtensionAndSwitch = useCallback(() => {
        pendingMLSwitchRef.current = true;
        setMlBlocksLoading(true);
        onActivateBlocksTab();
    }, [onActivateBlocksTab]);

    if (isRendererSupported === null) {
        isRendererSupported = Renderer.isSupported();
    }

    return (<MediaQuery minWidth={layout.fullSizeMinWidth}>{isFullSize => {
        const stageSize = resolveStageSize(stageSizeMode, isFullSize);

        return isPlayerOnly ? (
            <StageWrapper
                isFullScreen={isFullScreen}
                isRendererSupported={isRendererSupported}
                isRtl={isRtl}
                loading={loading}
                stageSize={STAGE_SIZE_MODES.large}
                vm={vm}
            >
                {alertsVisible ? (
                    <Alerts
                        vm={vm}
                        className={styles.alertsContainer}
                    />
                ) : null}
            </StageWrapper>
        ) : (
            <Box
                className={styles.pageWrapper}
                dir={isRtl ? 'rtl' : 'ltr'}
                {...componentProps}
            >
                {telemetryModalVisible ? (
                    <TelemetryModal
                        isRtl={isRtl}
                        isTelemetryEnabled={isTelemetryEnabled}
                        onCancel={onTelemetryModalCancel}
                        onOptIn={onTelemetryModalOptIn}
                        onOptOut={onTelemetryModalOptOut}
                        onRequestClose={onRequestCloseTelemetryModal}
                        onShowPrivacyPolicy={onShowPrivacyPolicy}
                    />
                ) : null}
                {loading ? (
                    <Loader
                        onCancel={onCancelLoader || onGoHome || (() => window.location.reload())}
                    />
                ) : null}
                {isCreating ? (
                    <Loader
                        messageId="gui.loader.creating"
                        onCancel={onCancelLoader || onGoHome || (() => window.location.reload())}
                    />
                ) : null}
                {mlBlocksLoading ? (
                    <Loader
                        messageId="gui.loader.message4"
                        onCancel={() => setMlBlocksLoading(false)}
                    />
                ) : null}
                {isRendererSupported ? null : (
                    <WebGlModal isRtl={isRtl} />
                )}
                {tipsLibraryVisible ? (
                    <TipsLibrary />
                ) : null}
                {cardsVisible ? (
                    <Cards />
                ) : null}
                {alertsVisible ? (
                    <Alerts
                        vm={vm}
                        className={styles.alertsContainer}
                    />
                ) : null}
                {connectionModalVisible ? (
                    <ConnectionModal
                        vm={vm}
                    />
                ) : null}
                {uploadProgressVisible ? (
                    <UploadProgress
                        vm={vm}
                    />
                ) : null}
                {costumeLibraryVisible ? (
                    <CostumeLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseCostumeLibrary}
                    />
                ) : null}
                {backdropLibraryVisible ? (
                    <BackdropLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseBackdropLibrary}
                    />
                ) : null}
                {updateModalVisible ? (
                    <UpdateModal
                        vm={vm}
                        onAbortUpdate={onAbortUpdate}
                        onClickUpdate={onClickUpdate}
                        onShowMessageBox={onShowMessageBox}
                    />
                ) : null}
                <MenuBar
                    accountNavOpen={accountNavOpen}
                    authorId={authorId}
                    authorThumbnailUrl={authorThumbnailUrl}
                    authorUsername={authorUsername}
                    canChangeLanguage={canChangeLanguage}
                    canCreateCopy={canCreateCopy}
                    canCreateNew={canCreateNew}
                    canEditTitle={canEditTitle}
                    canManageFiles={canManageFiles}
                    canRemix={canRemix}
                    canSave={canSave}
                    canShare={canShare}
                    className={styles.menuBarPosition}
                    enableCommunity={enableCommunity}
                    isShared={isShared}
                    logo={logo}
                    renderLogin={renderLogin}
                    showComingSoon={showComingSoon}
                    onClickAbout={onClickAbout}
                    onClickAccountNav={onClickAccountNav}
                    onClickLogo={onClickLogo}
                    onCloseAccountNav={onCloseAccountNav}
                    onLogOut={onLogOut}
                    onOpenRegistration={onOpenRegistration}
                    onProjectTelemetryEvent={onProjectTelemetryEvent}
                    onSeeCommunity={onSeeCommunity}
                    onShare={onShare}
                    onStartSelectingFileUpload={onStartSelectingFileUpload}
                    onShowMessageBox={onShowMessageBox}
                    onToggleLoginOpen={onToggleLoginOpen}
                    onClickCheckUpdate={onClickCheckUpdate}
                    onClickClearCache={onClickClearCache}
                    onClickInstallDriver={onClickInstallDriver}
                    onClickDevicePermissions={onClickDevicePermissions}
                    onDirectSave={onDirectSave}
                    onGoHome={onGoHome}
                    onNewBlocksProject={props.onNewBlocksProject}
                    onNewRoboticsProject={props.onNewRoboticsProject}
                    projectDirty={props.projectDirty}
                    lastSavedAt={props.lastSavedAt}
                    onProjectDirtyChanged={props.onProjectDirtyChanged}
                />
                <Box className={styles.bodyWrapper}>
                    <Box className={styles.flexWrapper}>
                        <Box className={styles.editorWrapper}>
                            <Tabs
                                forceRenderTabPanel
                                className={tabClassNames.tabs}
                                selectedIndex={activeTabIndex}
                                selectedTabClassName={tabClassNames.tabSelected}
                                selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                onSelect={onActivateTab}
                            >
                                <TabList className={tabClassNames.tabList}>
                                    <Tab className={tabClassNames.tab}>
                                        <img
                                            draggable={false}
                                            src={codeIcon}
                                        />
                                        <FormattedMessage
                                            defaultMessage="Code"
                                            description="Button to get to the code panel"
                                            id="gui.gui.codeTab"
                                        />
                                    </Tab>
                                    <Tab
                                        className={classNames(tabClassNames.tab,
                                            isRealtimeMode ? styles.hideCustomAndSoundTab :
                                                styles.showCustomAndSoundTab)}
                                        onClick={onActivateCostumesTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={costumesIcon}
                                        />
                                        {targetIsStage ? (
                                            <FormattedMessage
                                                defaultMessage="Backdrops"
                                                description="Button to get to the backdrops panel"
                                                id="gui.gui.backdropsTab"
                                            />
                                        ) : (
                                            <FormattedMessage
                                                defaultMessage="Costumes"
                                                description="Button to get to the costumes panel"
                                                id="gui.gui.costumesTab"
                                            />
                                        )}
                                    </Tab>
                                    <Tab
                                        className={classNames(tabClassNames.tab,
                                            isRealtimeMode ? styles.hideCustomAndSoundTab :
                                                styles.showCustomAndSoundTab)}
                                        onClick={onActivateSoundsTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={soundsIcon}
                                        />
                                        <FormattedMessage
                                            defaultMessage="Sounds"
                                            description="Button to get to the sounds panel"
                                            id="gui.gui.soundsTab"
                                        />
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        style={{display: 'none'}}
                                    >
                                        {'AI & ML'}
                                    </Tab>
                                </TabList>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    <Box className={styles.blocksWrapper}>
                                        <Blocks
                                            canUseCloud={canUseCloud}
                                            grow={1}
                                            isVisible={blocksTabVisible}
                                            options={{
                                                media: `${basePath}static/blocks-media/`
                                            }}
                                            stageSize={stageSize}
                                            vm={vm}
                                            onShowMessageBox={onShowMessageBox}
                                        />
                                    </Box>
                                    <Box className={styles.extensionButtonContainer}>
                                        <button
                                            className={styles.extensionButton}
                                            title={intl.formatMessage(messages.addExtension)}
                                            onClick={onExtensionButtonClick}
                                        >
                                            <img
                                                className={styles.extensionButtonIcon}
                                                draggable={false}
                                                src={addExtensionIcon}
                                            />
                                        </button>
                                    </Box>
                                    <Box className={styles.watermark}>
                                        <Watermark />
                                    </Box>
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {costumesTabVisible ? <CostumeTab vm={vm} /> : null}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {soundsTabVisible ? <SoundTab
                                        vm={vm}
                                        onShowMessageBox={onShowMessageBox}
                                    /> : null}
                                </TabPanel>
                                <TabPanel className={classNames(tabClassNames.tabPanel, styles.mlTabPanel)}>
                                    {mlTabVisible ? (
                                        <div className={styles.mlPanelWrapper}>
                                            {mlView === 'projects' ? (
                                                <>
                                                    <MLProjectsPage
                                                        projects={mlProjects}
                                                        onBack={onActivateBlocksTab}
                                                        onCreate={() => setShowCreateModal(true)}
                                                        onOpen={p => { setActiveMLProject(p); setMlView('training'); }}
                                                        onDelete={deleteMLProject}
                                                        onImport={importMLProject}
                                                    />
                                                    {showCreateModal && (
                                                        <CreateProjectModal
                                                            onCancel={() => setShowCreateModal(false)}
                                                            onCreate={createMLProject}
                                                        />
                                                    )}
                                                </>
                                            ) : (
                                                <MLTrainingPage
                                                    project={activeMLProject}
                                                    onBack={() => { setMlView('projects'); setActiveMLProject(null); }}
                                                    onUseInBlocks={loadMLExtensionAndSwitch}
                                                    onUpdateProject={updateMLProject}
                                                    onNewProject={() => { setMlView('projects'); setActiveMLProject(null); setShowHomeScreen(true); }}
                                                    onNewMLProject={() => { setMlView('projects'); setActiveMLProject(null); setShowCreateModal(true); }}
                                                    onOpenMLProject={() => { setMlView('projects'); setActiveMLProject(null); importMLProject(); }}
                                                />
                                            )}
                                        </div>
                                    ) : null}
                                </TabPanel>
                            </Tabs>
                            {/*
                                    backpackVisible ? (
                                        <Backpack host={backpackHost} />
                                    ) : null
                                */}
                        </Box>
                        <Box
                            className={classNames(styles.stageAndTargetWrapper, styles[stageSize],
                                isRealtimeMode ? styles.showStage : styles.hideStage)}
                        >
                            <StageWrapper
                                isFullScreen={isFullScreen}
                                isRendererSupported={isRendererSupported}
                                isRtl={isRtl}
                                stageSize={stageSize}
                                vm={vm}
                            />
                            <Box className={styles.targetWrapper}>
                                <TargetPane
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                            </Box>
                        </Box>
                        {((isRealtimeMode === false) && (stageSizeMode !== STAGE_SIZE_MODES.hide)) ? (
                            <Hardware
                                vm={vm}
                                stageSize={stageSize}
                            />) : null
                        }
                    </Box>
                    <DragLayer />
                    {(isRealtimeMode === false) ? (
                        <HardwareHeader
                            vm={vm}
                            stageSize={stageSize}
                        />) : null
                    }
                </Box>
            </Box>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    canChangeLanguage: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateMLTab: PropTypes.func,
    onActivateBlocksTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    mlTabVisible: PropTypes.bool,
    onClickAccountNav: PropTypes.func,
    onClickLogo: PropTypes.func,
    onClickCheckUpdate: PropTypes.func,
    onAbortUpdate: PropTypes.func,
    onClickUpdate: PropTypes.func,
    onClickClearCache: PropTypes.func,
    onClickInstallDriver: PropTypes.func,
    onClickDevicePermissions: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onShowMessageBox: PropTypes.func.isRequired,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    showComingSoon: PropTypes.bool,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    tipsLibraryVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired,
    isRealtimeMode: PropTypes.bool,
    isScratchDesktop: PropTypes.bool
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    canChangeLanguage: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    // This is the button's mode, as opposed to the actual current state
    stageSizeMode: state.scratchGui.stageSize.stageSize
});

export default injectIntl(connect(
    mapStateToProps
)(GUIComponent));
