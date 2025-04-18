import PropTypes from 'prop-types';
import { PureComponent } from 'react';

import { defineMessages, injectIntl } from 'react-intl';

import classNames from 'classnames';

import { is } from 'immutable';

import { throttle } from 'lodash';

import FullscreenIcon from '@/material-icons/400-24px/fullscreen.svg?react';
import FullscreenExitIcon from '@/material-icons/400-24px/fullscreen_exit.svg?react';
import PauseIcon from '@/material-icons/400-24px/pause.svg?react';
import PlayArrowIcon from '@/material-icons/400-24px/play_arrow-fill.svg?react';
import RectangleIcon from '@/material-icons/400-24px/rectangle.svg?react';
import VisibilityOffIcon from '@/material-icons/400-24px/visibility_off.svg?react';
import VolumeOffIcon from '@/material-icons/400-24px/volume_off-fill.svg?react';
import VolumeUpIcon from '@/material-icons/400-24px/volume_up-fill.svg?react';
import { Blurhash } from 'flavours/glitch/components/blurhash';
import { Icon }  from 'flavours/glitch/components/icon';
import { SpoilerButton } from 'flavours/glitch/components/spoiler_button';
import { playerSettings } from 'flavours/glitch/settings';

import { displayMedia, useBlurhash } from '../../initial_state';
import { isFullscreen, requestFullscreen, exitFullscreen } from '../ui/util/fullscreen';

const messages = defineMessages({
  play: { id: 'video.play', defaultMessage: 'Play' },
  pause: { id: 'video.pause', defaultMessage: 'Pause' },
  mute: { id: 'video.mute', defaultMessage: 'Mute sound' },
  unmute: { id: 'video.unmute', defaultMessage: 'Unmute sound' },
  hide: { id: 'video.hide', defaultMessage: 'Hide video' },
  expand: { id: 'video.expand', defaultMessage: 'Expand video' },
  close: { id: 'video.close', defaultMessage: 'Close video' },
  fullscreen: { id: 'video.fullscreen', defaultMessage: 'Full screen' },
  exit_fullscreen: { id: 'video.exit_fullscreen', defaultMessage: 'Exit full screen' },
});

export const formatTime = secondsNum => {
  let hours   = Math.floor(secondsNum / 3600);
  let minutes = Math.floor((secondsNum - (hours * 3600)) / 60);
  let seconds = secondsNum - (hours * 3600) - (minutes * 60);

  if (hours   < 10) hours   = '0' + hours;
  if (minutes < 10) minutes = '0' + minutes;
  if (seconds < 10) seconds = '0' + seconds;

  return (hours === '00' ? '' : `${hours}:`) + `${minutes}:${seconds}`;
};

export const findElementPosition = el => {
  let box;

  if (el.getBoundingClientRect && el.parentNode) {
    box = el.getBoundingClientRect();
  }

  if (!box) {
    return {
      left: 0,
      top: 0,
    };
  }

  const docEl = document.documentElement;
  const body  = document.body;

  const clientLeft = docEl.clientLeft || body.clientLeft || 0;
  const scrollLeft = window.pageXOffset || body.scrollLeft;
  const left       = (box.left + scrollLeft) - clientLeft;

  const clientTop = docEl.clientTop || body.clientTop || 0;
  const scrollTop = window.pageYOffset || body.scrollTop;
  const top       = (box.top + scrollTop) - clientTop;

  return {
    left: Math.round(left),
    top: Math.round(top),
  };
};

export const getPointerPosition = (el, event) => {
  const position = {};
  const box = findElementPosition(el);
  const boxW = el.offsetWidth;
  const boxH = el.offsetHeight;
  const boxY = box.top;
  const boxX = box.left;

  let pageY = event.pageY;
  let pageX = event.pageX;

  if (event.changedTouches) {
    pageX = event.changedTouches[0].pageX;
    pageY = event.changedTouches[0].pageY;
  }

  position.y = Math.max(0, Math.min(1, (pageY - boxY) / boxH));
  position.x = Math.max(0, Math.min(1, (pageX - boxX) / boxW));

  return position;
};

export const fileNameFromURL = str => {
  const url      = new URL(str);
  const pathname = url.pathname;
  const index    = pathname.lastIndexOf('/');

  return pathname.slice(index + 1);
};

class Video extends PureComponent {

  static propTypes = {
    preview: PropTypes.string,
    frameRate: PropTypes.string,
    src: PropTypes.string.isRequired,
    alt: PropTypes.string,
    lang: PropTypes.string,
    sensitive: PropTypes.bool,
    currentTime: PropTypes.number,
    onOpenVideo: PropTypes.func,
    onCloseVideo: PropTypes.func,
    detailed: PropTypes.bool,
    inline: PropTypes.bool,
    editable: PropTypes.bool,
    alwaysVisible: PropTypes.bool,
    visible: PropTypes.bool,
    letterbox: PropTypes.bool,
    fullwidth: PropTypes.bool,
    preventPlayback: PropTypes.bool,
    onToggleVisibility: PropTypes.func,
    deployPictureInPicture: PropTypes.func,
    intl: PropTypes.object.isRequired,
    blurhash: PropTypes.string,
    autoPlay: PropTypes.bool,
    volume: PropTypes.number,
    muted: PropTypes.bool,
    componentIndex: PropTypes.number,
    autoFocus: PropTypes.bool,
  };

  static defaultProps = {
    frameRate: '25',
  };

  state = {
    currentTime: 0,
    duration: 0,
    volume: 0.5,
    paused: true,
    dragging: false,
    fullscreen: false,
    hovered: false,
    muted: false,
    revealed: this.props.visible !== undefined ? this.props.visible : (displayMedia !== 'hide_all' && !this.props.sensitive || displayMedia === 'show_all'),
  };

  setPlayerRef = c => {
    this.player = c;
  };

  setVideoRef = c => {
    this.video = c;

    if (this.video) {
      this.setState({ volume: this.video.volume, muted: this.video.muted });
    }
  };

  setSeekRef = c => {
    this.seek = c;
  };

  setVolumeRef = c => {
    this.volume = c;
  };

  handleClickRoot = e => e.stopPropagation();

  handlePlay = () => {
    this.setState({ paused: false });
    this._updateTime();
  };

  handlePause = () => {
    this.setState({ paused: true });
  };

  _updateTime () {
    requestAnimationFrame(() => {
      if (!this.video) return;

      this.handleTimeUpdate();

      if (!this.state.paused) {
        this._updateTime();
      }
    });
  }

  handleTimeUpdate = () => {
    this.setState({
      currentTime: this.video.currentTime,
      duration:this.video.duration,
    });
  };

  handleVolumeMouseDown = e => {
    document.addEventListener('mousemove', this.handleMouseVolSlide, true);
    document.addEventListener('mouseup', this.handleVolumeMouseUp, true);
    document.addEventListener('touchmove', this.handleMouseVolSlide, true);
    document.addEventListener('touchend', this.handleVolumeMouseUp, true);

    this.handleMouseVolSlide(e);

    e.preventDefault();
    e.stopPropagation();
  };

  handleVolumeMouseUp = () => {
    document.removeEventListener('mousemove', this.handleMouseVolSlide, true);
    document.removeEventListener('mouseup', this.handleVolumeMouseUp, true);
    document.removeEventListener('touchmove', this.handleMouseVolSlide, true);
    document.removeEventListener('touchend', this.handleVolumeMouseUp, true);
  };

  handleMouseVolSlide = throttle(e => {
    const { x } = getPointerPosition(this.volume, e);

    if(!isNaN(x)) {
      this.setState((state) => ({ volume: x, muted: state.muted && x === 0 }), () => {
        this._syncVideoToVolumeState(x);
        this._saveVolumeState(x);
      });
    }
  }, 15);

  handleMouseDown = e => {
    document.addEventListener('mousemove', this.handleMouseMove, true);
    document.addEventListener('mouseup', this.handleMouseUp, true);
    document.addEventListener('touchmove', this.handleMouseMove, true);
    document.addEventListener('touchend', this.handleMouseUp, true);

    this.setState({ dragging: true });
    this.video.pause();
    this.handleMouseMove(e);

    e.preventDefault();
    e.stopPropagation();
  };

  handleMouseUp = () => {
    document.removeEventListener('mousemove', this.handleMouseMove, true);
    document.removeEventListener('mouseup', this.handleMouseUp, true);
    document.removeEventListener('touchmove', this.handleMouseMove, true);
    document.removeEventListener('touchend', this.handleMouseUp, true);

    this.setState({ dragging: false });
    this.video.play();
  };

  handleMouseMove = throttle(e => {
    const { x } = getPointerPosition(this.seek, e);
    const currentTime = this.video.duration * x;

    if (!isNaN(currentTime)) {
      this.setState({ currentTime }, () => {
        this.video.currentTime = currentTime;
      });
    }
  }, 15);

  seekBy (time) {
    const currentTime = this.video.currentTime + time;

    if (!isNaN(currentTime)) {
      this.setState({ currentTime }, () => {
        this.video.currentTime = currentTime;
      });
    }
  }

  handleVideoKeyDown = e => {
    // On the video element or the seek bar, we can safely use the space bar
    // for playback control because there are no buttons to press

    if (e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      this.togglePlay();
    }
  };

  handleKeyDown = e => {
    const frameTime = 1 / this.getFrameRate();

    switch(e.key) {
    case 'k':
      e.preventDefault();
      e.stopPropagation();
      this.togglePlay();
      break;
    case 'm':
      e.preventDefault();
      e.stopPropagation();
      this.toggleMute();
      break;
    case 'f':
      e.preventDefault();
      e.stopPropagation();
      this.toggleFullscreen();
      break;
    case 'j':
      e.preventDefault();
      e.stopPropagation();
      this.seekBy(-10);
      break;
    case 'l':
      e.preventDefault();
      e.stopPropagation();
      this.seekBy(10);
      break;
    case ',':
      e.preventDefault();
      e.stopPropagation();
      this.seekBy(-frameTime);
      break;
    case '.':
      e.preventDefault();
      e.stopPropagation();
      this.seekBy(frameTime);
      break;
    }

    // If we are in fullscreen mode, we don't want any hotkeys
    // interacting with the UI that's not visible

    if (this.state.fullscreen) {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        exitFullscreen();
      }
    }
  };

  togglePlay = () => {
    if (this.state.paused) {
      this.setState({ paused: false }, () => this.video.play());
    } else {
      this.setState({ paused: true }, () => this.video.pause());
    }
  };

  toggleFullscreen = () => {
    if (isFullscreen()) {
      exitFullscreen();
    } else {
      requestFullscreen(this.player);
    }
  };

  componentDidMount () {
    document.addEventListener('fullscreenchange', this.handleFullscreenChange, true);
    document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange, true);
    document.addEventListener('mozfullscreenchange', this.handleFullscreenChange, true);
    document.addEventListener('MSFullscreenChange', this.handleFullscreenChange, true);

    window.addEventListener('scroll', this.handleScroll);

    this._syncVideoFromLocalStorage();
  }

  componentWillUnmount () {
    window.removeEventListener('scroll', this.handleScroll);

    document.removeEventListener('fullscreenchange', this.handleFullscreenChange, true);
    document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange, true);
    document.removeEventListener('mozfullscreenchange', this.handleFullscreenChange, true);
    document.removeEventListener('MSFullscreenChange', this.handleFullscreenChange, true);

    if (!this.state.paused && this.video && this.props.deployPictureInPicture) {
      this.props.deployPictureInPicture('video', {
        src: this.props.src,
        currentTime: this.video.currentTime,
        muted: this.video.muted,
        volume: this.video.volume,
      });
    }
  }

  UNSAFE_componentWillReceiveProps (nextProps) {
    if (!is(nextProps.visible, this.props.visible) && nextProps.visible !== undefined) {
      this.setState({ revealed: nextProps.visible });
    }
  }

  componentDidUpdate (prevProps) {
    if (this.video && this.state.revealed && this.props.preventPlayback && !prevProps.preventPlayback) {
      this.video.pause();
    }
  }

  handleScroll = throttle(() => {
    if (!this.video) {
      return;
    }

    const { top, height } = this.video.getBoundingClientRect();
    const inView = (top <= (window.innerHeight || document.documentElement.clientHeight)) && (top + height >= 0);

    if (!this.state.paused && !inView) {
      this.video.pause();

      if (this.props.deployPictureInPicture) {
        this.props.deployPictureInPicture('video', {
          src: this.props.src,
          currentTime: this.video.currentTime,
          muted: this.video.muted,
          volume: this.video.volume,
        });
      }

      this.setState({ paused: true });
    }
  }, 150, { trailing: true });

  handleFullscreenChange = () => {
    this.setState({ fullscreen: isFullscreen() });
  };

  handleMouseEnter = () => {
    this.setState({ hovered: true });
  };

  handleMouseLeave = () => {
    this.setState({ hovered: false });
  };

  toggleMute = () => {
    const muted = !(this.video.muted || this.state.volume === 0);

    this.setState((state) => ({ muted, volume: Math.max(state.volume || 0.5, 0.05) }), () => {
      this._syncVideoToVolumeState();
      this._saveVolumeState();
    });
  };

  _syncVideoToVolumeState = (volume = null, muted = null) => {
    if (!this.video) {
      return;
    }

    this.video.volume = volume ?? this.state.volume;
    this.video.muted = muted ?? this.state.muted;
  };

  _saveVolumeState = (volume = null, muted = null) => {
    playerSettings.set('volume', volume ?? this.state.volume);
    playerSettings.set('muted', muted ?? this.state.muted);
  };

  _syncVideoFromLocalStorage = () => {
    this.setState({ volume: playerSettings.get('volume') ?? 0.5, muted: playerSettings.get('muted') ?? false }, () => {
      this._syncVideoToVolumeState();
    });
  };

  toggleReveal = () => {
    if (this.state.revealed) {
      this.setState({ paused: true });
    }

    if (this.props.onToggleVisibility) {
      this.props.onToggleVisibility();
    } else {
      this.setState({ revealed: !this.state.revealed });
    }
  };

  handleLoadedData = () => {
    const { currentTime, volume, muted, autoPlay } = this.props;

    if (currentTime) {
      this.video.currentTime = currentTime;
    }

    if (volume !== undefined) {
      this.video.volume = volume;
    }

    if (muted !== undefined) {
      this.video.muted = muted;
    }

    if (autoPlay) {
      this.video.play();
    }
  };

  handleProgress = () => {
    const lastTimeRange = this.video.buffered.length - 1;

    if (lastTimeRange > -1) {
      this.setState({ buffer: Math.ceil(this.video.buffered.end(lastTimeRange) / this.video.duration * 100) });
    }
  };

  handleVolumeChange = () => {
    this.setState({ volume: this.video.volume, muted: this.video.muted });
    this._saveVolumeState(this.video.volume, this.video.muted);
  };

  handleOpenVideo = () => {
    this.video.pause();

    this.props.onOpenVideo(this.props.lang, {
      startTime: this.video.currentTime,
      autoPlay: !this.state.paused,
      defaultVolume: this.state.volume,
      componentIndex: this.props.componentIndex,
    });
  };

  handleCloseVideo = () => {
    this.video.pause();
    this.props.onCloseVideo();
  };

  getFrameRate () {
    if (this.props.frameRate && isNaN(this.props.frameRate)) {
      // The frame rate is returned as a fraction string so we
      // need to convert it to a number

      return this.props.frameRate.split('/').reduce((p, c) => p / c);
    }

    return this.props.frameRate;
  }

  render () {
    const { preview, src, inline, onOpenVideo, onCloseVideo, intl, alt, lang, letterbox, fullwidth, detailed, sensitive, editable, blurhash, autoFocus } = this.props;
    const { currentTime, duration, volume, buffer, dragging, paused, fullscreen, hovered, revealed } = this.state;
    const progress = Math.min((currentTime / duration) * 100, 100);
    const muted = this.state.muted || volume === 0;

    const playerStyle = {};

    if (inline) {
      playerStyle.aspectRatio = '16 / 9';
    }

    let preload;

    if (this.props.currentTime || fullscreen || dragging) {
      preload = 'auto';
    } else if (detailed) {
      preload = 'metadata';
    } else {
      preload = 'none';
    }

    return (
      <div
        role='menuitem'
        className={classNames('video-player', { inactive: !revealed, detailed, inline: inline && !fullscreen, fullscreen, editable, letterbox, 'full-width': fullwidth })}
        style={playerStyle}
        ref={this.setPlayerRef}
        onMouseEnter={this.handleMouseEnter}
        onMouseLeave={this.handleMouseLeave}
        onClick={this.handleClickRoot}
        onKeyDown={this.handleKeyDown}
        tabIndex={0}
      >
        <Blurhash
          hash={blurhash}
          className={classNames('media-gallery__preview', {
            'media-gallery__preview--hidden': revealed,
          })}
          dummy={!useBlurhash}
        />

        {(revealed || editable) && <video
          ref={this.setVideoRef}
          src={src}
          poster={preview}
          preload={preload}
          role='button'
          tabIndex={0}
          aria-label={alt}
          title={alt}
          lang={lang}
          onClick={this.togglePlay}
          onKeyDown={this.handleVideoKeyDown}
          onPlay={this.handlePlay}
          onPause={this.handlePause}
          onLoadedData={this.handleLoadedData}
          onProgress={this.handleProgress}
          onVolumeChange={this.handleVolumeChange}
          style={{ ...playerStyle, width: '100%' }}
        />}

        <SpoilerButton hidden={revealed || editable} sensitive={sensitive} onClick={this.toggleReveal} />

        <div className={classNames('video-player__controls', { active: paused || hovered })}>
          <div className='video-player__seek' onMouseDown={this.handleMouseDown} ref={this.setSeekRef}>
            <div className='video-player__seek__buffer' style={{ width: `${buffer}%` }} />
            <div className='video-player__seek__progress' style={{ width: `${progress}%` }} />

            <span
              className={classNames('video-player__seek__handle', { active: dragging })}
              tabIndex={0}
              style={{ left: `${progress}%` }}
              onKeyDown={this.handleVideoKeyDown}
            />
          </div>

          <div className='video-player__buttons-bar'>
            <div className='video-player__buttons left'>
              <button type='button' title={intl.formatMessage(paused ? messages.play : messages.pause)} aria-label={intl.formatMessage(paused ? messages.play : messages.pause)} className='player-button' onClick={this.togglePlay} autoFocus={autoFocus}><Icon id={paused ? 'play' : 'pause'} icon={paused ? PlayArrowIcon : PauseIcon} /></button>
              <button type='button' title={intl.formatMessage(muted ? messages.unmute : messages.mute)} aria-label={intl.formatMessage(muted ? messages.unmute : messages.mute)} className='player-button' onClick={this.toggleMute}><Icon id={muted ? 'volume-off' : 'volume-up'} icon={muted ? VolumeOffIcon : VolumeUpIcon} /></button>

              <div className={classNames('video-player__volume', { active: this.state.hovered })} onMouseDown={this.handleVolumeMouseDown} ref={this.setVolumeRef}>
                <div className='video-player__volume__current' style={{ width: `${muted ? 0 : volume * 100}%` }} />

                <span
                  className={classNames('video-player__volume__handle')}
                  tabIndex={0}
                  style={{ left: `${muted ? 0 : volume * 100}%` }}
                />
              </div>

              {(detailed || fullscreen) && (
                <span className='video-player__time'>
                  <span className='video-player__time-current'>{formatTime(Math.floor(currentTime))}</span>
                  <span className='video-player__time-sep'>/</span>
                  <span className='video-player__time-total'>{formatTime(Math.floor(duration))}</span>
                </span>
              )}
            </div>

            <div className='video-player__buttons right'>
              {(!onCloseVideo && !editable && !fullscreen && !this.props.alwaysVisible) && <button type='button' title={intl.formatMessage(messages.hide)} aria-label={intl.formatMessage(messages.hide)} className='player-button' onClick={this.toggleReveal}><Icon id='eye-slash' icon={VisibilityOffIcon} /></button>}
              {(!fullscreen && onOpenVideo) && <button type='button' title={intl.formatMessage(messages.expand)} aria-label={intl.formatMessage(messages.expand)} className='player-button' onClick={this.handleOpenVideo}><Icon id='expand' icon={RectangleIcon} /></button>}
              {onCloseVideo && <button type='button' title={intl.formatMessage(messages.close)} aria-label={intl.formatMessage(messages.close)} className='player-button' onClick={this.handleCloseVideo}><Icon id='compress' icon={FullscreenExitIcon} /></button>}
              <button type='button' title={intl.formatMessage(fullscreen ? messages.exit_fullscreen : messages.fullscreen)} aria-label={intl.formatMessage(fullscreen ? messages.exit_fullscreen : messages.fullscreen)} className='player-button' onClick={this.toggleFullscreen}><Icon id={fullscreen ? 'compress' : 'arrows-alt'} icon={fullscreen ? FullscreenExitIcon : FullscreenIcon} /></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

}

export default injectIntl(Video);
