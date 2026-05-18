import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import React from 'react';

import MessageBoxType from '../lib/message-box.js';

const MenuBarHOC = function (WrappedComponent) {
    class MenuBarContainer extends React.PureComponent {
        constructor (props) {
            super(props);

            bindAll(this, [
                'confirmReadyToReplaceProject',
                'confirmClearCache',
                'shouldSaveBeforeTransition'
            ]);
        }
        async confirmReadyToReplaceProject (message) {
            if (this.props.projectChanged && !this.props.canCreateNew) {
                return this.props.onShowMessageBox(MessageBoxType.confirm, message);
            }
            return true;
        }
        async confirmClearCache (message) {
            return this.props.onShowMessageBox(MessageBoxType.confirm, message);
        }
        shouldSaveBeforeTransition () {
            return (this.props.canSave && this.props.projectChanged);
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                projectChanged,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (<WrappedComponent
                confirmReadyToReplaceProject={this.confirmReadyToReplaceProject}
                confirmClearCache={this.confirmClearCache}
                shouldSaveBeforeTransition={this.shouldSaveBeforeTransition}
                {...props}
            />);
        }
    }

    MenuBarContainer.propTypes = {
        canCreateNew: PropTypes.bool,
        canSave: PropTypes.bool,
        onShowMessageBox: PropTypes.func.isRequired,
        projectChanged: PropTypes.bool
    };
    const mapStateToProps = state => ({
        projectChanged: state.scratchGui.projectChanged
    });
    const mapDispatchToProps = () => ({});
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(MenuBarContainer);
};

export default MenuBarHOC;
