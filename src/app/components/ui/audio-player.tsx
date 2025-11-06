import VideoJS from 'react-video-js-player';

const AudioPlayer = ({ audioSrc, posterSrc }: { audioSrc: string; posterSrc: string }) => {
  const videoJsOptions = {
    controls: true,
    autoplay: false,
    preload: 'auto' as const,
    poster: posterSrc,
    sources: [
      {
        src: audioSrc,
        type: 'audio/mp3',
      },
    ],
  };

  return (
    <div>
      <VideoJS options={videoJsOptions} />
    </div>
  );
};

export default AudioPlayer;
