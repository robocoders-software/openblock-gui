import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {projectTitleInitialState} from '../reducers/project-title';
import downloadBlob from '../lib/download-blob';
/**
 * Project saver component passes a downloadProject function to its child.
 * It expects this child to be a function with the signature
 *     function (downloadProject, props) {}
 * The component can then be used to attach project saving functionality
 * to any other component:
 *
 * <SB3Downloader>{(downloadProject, props) => (
 *     <MyCoolComponent
 *         onClick={downloadProject}
 *         {...props}
 *     />
 * )}</SB3Downloader>
 */
class SB3Downloader extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'downloadProject'
        ]);
    }
    downloadProject () {
        this.props.saveProjectSb3()
            .then(content => {
                if (this.props.onSaveFinished) {
                    this.props.onSaveFinished();
                }
                downloadBlob(this.props.projectFilename, content);
            })
            .catch(err => {
                // eslint-disable-next-line no-console
                console.error('Failed to serialize project for download:', err);
                if (this.props.onSaveFinished) {
                    this.props.onSaveFinished();
                }
            });
    }
    render () {
        const {
            children
        } = this.props;
        return children(
            this.props.className,
            this.downloadProject
        );
    }
}

const getProjectFilename = (curTitle, defaultTitle, extension) => {
    let filenameTitle = curTitle;
    if (!filenameTitle || filenameTitle.length === 0) {
        filenameTitle = defaultTitle;
    }
    const ext = extension || 'rc';
    return `${filenameTitle.substring(0, 100)}.${ext}`;
};

SB3Downloader.propTypes = {
    children: PropTypes.func,
    className: PropTypes.string,
    extension: PropTypes.string,
    onSaveFinished: PropTypes.func,
    projectFilename: PropTypes.string,
    saveProjectSb3: PropTypes.func
};
SB3Downloader.defaultProps = {
    className: '',
    extension: 'rc'
};

const mapStateToProps = (state, ownProps) => ({
    saveProjectSb3: state.scratchGui.vm.saveProjectSb3.bind(state.scratchGui.vm),
    projectFilename: getProjectFilename(
        state.scratchGui.projectTitle,
        projectTitleInitialState,
        ownProps.extension
    )
});

export default connect(
    mapStateToProps,
    () => ({}) // omit dispatch prop
)(SB3Downloader);
