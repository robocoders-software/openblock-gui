import React from 'react';
import PropTypes from 'prop-types';
import styles from './board-install-modal.css';

const BoardInstallModal = ({
    deviceName,
    packageName,
    packageSizeMB,
    installing,
    progress,
    error,
    onConfirm,
    onCancel,
    onCancelInstall,
    onBackground
}) => (
    <div className={styles.overlay}>
        <div className={styles.modal}>
            <div className={styles.icon}>📦</div>
            <h2 className={styles.title}>Board Support Not Installed</h2>
            <p className={styles.body}>
                <strong>{deviceName}</strong> requires the <strong>{packageName}</strong> package
                to be installed before you can use it.
                {packageSizeMB ? ` (${packageSizeMB} MB)` : ''}
            </p>
            <p className={styles.note}>
                The board files are already on your computer — no internet needed.
                Installation may take a few minutes.
            </p>

            {error && (
                <p className={styles.error}>{error}</p>
            )}

            {installing ? (
                <div className={styles.progressWrap}>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{width: `${progress || 0}%`}}
                        />
                    </div>
                    <p className={styles.progressLabel}>
                        {progress > 0
                            ? `Installing… ${progress}%`
                            : 'Installing board support… please wait'}
                    </p>
                    <div className={styles.installActions}>
                        {onBackground && (
                            <button
                                className={styles.backgroundBtn}
                                onClick={onBackground}
                            >
                                Run in Background
                            </button>
                        )}
                        {onCancelInstall && (
                            <button
                                className={styles.cancelInstallBtn}
                                onClick={onCancelInstall}
                            >
                                Cancel Installation
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className={styles.actions}>
                    <button
                        className={styles.cancelBtn}
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        className={styles.installBtn}
                        onClick={onConfirm}
                    >
                        {error ? 'Retry' : 'Install Now'}
                    </button>
                </div>
            )}
        </div>
    </div>
);

BoardInstallModal.propTypes = {
    deviceName:      PropTypes.string.isRequired,
    packageName:     PropTypes.string.isRequired,
    packageSizeMB:   PropTypes.number,
    installing:      PropTypes.bool,
    progress:        PropTypes.number,
    error:           PropTypes.string,
    onConfirm:       PropTypes.func.isRequired,
    onCancel:        PropTypes.func.isRequired,
    onCancelInstall: PropTypes.func,
    onBackground:    PropTypes.func
};

BoardInstallModal.defaultProps = {
    installing:      false,
    progress:        0,
    error:           null,
    packageSizeMB:   null,
    onCancelInstall: null,
    onBackground:    null
};

export default BoardInstallModal;
