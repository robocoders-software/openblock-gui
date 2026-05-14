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
import {MLProjectsPage, MLTrainingPage, CreateProjectModal, deleteProjectFS as deleteProjectIDB} from 'openblock-ml-studio';
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
        onGoHome,
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
        deleteProjectIDB(id).catch(() => {});
    }, []);

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
            const hasMLBlocks = vm.runtime && vm.runtime.targets &&
                vm.runtime.targets.some(t =>
                    Object.values(t.blocks._blocks || {}).some(b =>
                        b.opcode && b.opcode.startsWith('teachableMachine_')
                    )
                );
            if (!hasMLBlocks) vm.extensionManager.unloadExtension('teachableMachine');
        }
    }, [mlTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

    // When the user clicks "← Back" in the full-screen ML Studio without exporting,
    // unload the teachableMachine extension — but only if the project itself has no
    // ML blocks (extension came from ML Studio, not from the saved project).
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;
        const handler = () => {
            if (vm.extensionManager.isExtensionLoaded('teachableMachine') &&
                !window.__openblockMLModel) {
                const hasMLBlocks = vm.runtime && vm.runtime.targets &&
                    vm.runtime.targets.some(t =>
                        Object.values(t.blocks._blocks || {}).some(b =>
                            b.opcode && b.opcode.startsWith('teachableMachine_')
                        )
                    );
                if (!hasMLBlocks) vm.extensionManager.unloadExtension('teachableMachine');
            }
        };
        window.addEventListener('robocoders:ml-back', handler);
        return () => window.removeEventListener('robocoders:ml-back', handler);
    }, [vm]); // eslint-disable-line react-hooks/exhaustive-deps

    // Desktop path: when WrappedGui first mounts after an ML export, the project is not
    // yet loaded (targets are null), so we must wait for the first targetsUpdate before
    // loading the extension and refreshing — otherwise getToolboxXML() returns null and
    // the toolbox never picks up the ML blocks.
    useEffect(() => {
        if (!vm || !vm.extensionManager) return;
        if (typeof window === 'undefined' || !window.__openblockMLModel) return;
        if (vm.extensionManager.isExtensionLoaded('teachableMachine')) return;

        const doLoad = () => {
            vm.extensionManager.loadExtensionURL('teachableMachine')
                .then(() => vm.extensionManager.refreshBlocks())
                .catch(e => console.warn('[ML] auto-load failed:', e));
        };

        // If the project already has targets (e.g. visited blocks first), load now.
        if (vm.runtime.targets && vm.runtime.targets.length > 0) {
            doLoad();
            return;
        }
        // Otherwise wait for the first targetsUpdate (project finished loading).
        const onTargetsReady = () => {
            vm.removeListener('targetsUpdate', onTargetsReady);
            doLoad();
        };
        vm.addListener('targetsUpdate', onTargetsReady);
        return () => vm.removeListener('targetsUpdate', onTargetsReady);
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

        if (vm.extensionManager.isExtensionLoaded('teachableMachine')) {
            // Extension already loaded; give Blockly 150ms to finish layout
            setTimeout(doRefresh, 150);
        } else {
            vm.extensionManager.loadExtensionURL('teachableMachine')
                .then(() => setTimeout(doRefresh, 150))
                .catch(e => {
                    console.warn('[ML] extension load failed:', e);
                    setMlBlocksLoading(false);
                });
        }
    }, [blocksTabVisible]); // eslint-disable-line react-hooks/exhaustive-deps

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
                    <Loader />
                ) : null}
                {isCreating ? (
                    <Loader messageId="gui.loader.creating" />
                ) : null}
                {mlBlocksLoading ? (
                    <Loader messageId="gui.loader.message4" />
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
                    onDirectSave={onDirectSave}
                    onGoHome={onGoHome}
                    onNewBlocksProject={props.onNewBlocksProject}
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
