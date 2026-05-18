import React from 'react';
import PropTypes from 'prop-types';
import styles from './board-install-modal.css';

const BoardInstallModal = ({deviceName, packageName, packageSizeMB, installing, error, onConfirm, onCancel}) => (
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
                        <div className={styles.progressFill} />
                    </div>
                    <p className={styles.progressLabel}>Installing board support… please wait</p>
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
                        Install Now
                    </button>
                </div>
            )}
        </div>
    </div>
);

BoardInstallModal.propTypes = {
    deviceName:    PropTypes.string.isRequired,
    packageName:   PropTypes.string.isRequired,
    packageSizeMB: PropTypes.number,
    installing:    PropTypes.bool,
    error:         PropTypes.string,
    onConfirm:     PropTypes.func.isRequired,
    onCancel:      PropTypes.func.isRequired
};

BoardInstallModal.defaultProps = {
    installing: false,
    error: null,
    packageSizeMB: null
};

export default BoardInstallModal;
