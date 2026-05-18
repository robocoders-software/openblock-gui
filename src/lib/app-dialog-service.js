import React from 'react';
import ReactDOM from 'react-dom';
import AppDialog from '../components/app-dialog/app-dialog.jsx';

let _container = null;

const getContainer = () => {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'robocoders-dialog-root';
    document.body.appendChild(_container);
    return _container;
};

/**
 * Show a themed application dialog (replaces native alert/confirm/dialog.showMessageBox).
 *
 * @param {object}   opts
 * @param {'info'|'warning'|'error'|'question'} [opts.type='info']
 * @param {string}   [opts.title='']
 * @param {string}   [opts.message='']
 * @param {string}   [opts.detail]       - Secondary (smaller) text below message
 * @param {string[]} [opts.buttons]      - Button labels; rendered left-to-right
 * @param {number}   [opts.defaultId=0]  - Index of the primary (blue) button
 * @param {number}   [opts.cancelId]     - Kept for API parity with Electron dialog; unused by renderer
 * @returns {Promise<number>} Resolves with the index of the clicked button
 */
const showAppDialog = ({
    type      = 'info',
    title     = '',
    message   = '',
    detail    = null,
    buttons   = ['OK'],
    defaultId = 0
    // cancelId intentionally ignored by the renderer
} = {}) => new Promise(resolve => {
    const container = getContainer();

    const handleClick = idx => {
        ReactDOM.unmountComponentAtNode(container);
        resolve(idx);
    };

    ReactDOM.render(
        <AppDialog
            type={type}
            title={title}
            message={message}
            detail={detail}
            buttons={buttons}
            defaultId={defaultId}
            onButtonClick={handleClick}
        />,
        container
    );
});

export default showAppDialog;
