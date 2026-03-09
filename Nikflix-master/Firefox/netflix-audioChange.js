



window.addEventListener("GetAudioTracksList",()=>{
    try{
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
        const AudioTracksObject = player.getAudioTrackList()
        window.postMessage({
            type: "FROM_AUDIOCHANGE_SCRIPT",
            audioTracks: AudioTracksObject,
        }, "*");
    } catch (err){
        console.error("[Netflix Ext] Get AudioTracksList failed\"", err)
    }
})

// change audio language
window.addEventListener("netflixAudioChange", (e) => {
    console.log("e",e)
    const AudioLanguageKey = e.detail;
    console.log("AudioLanguageKey", AudioLanguageKey)
    try {
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
        player.setAudioTrack(player.getAudioTrackList()[AudioLanguageKey])

    } catch (err) {
        console.error("[Netflix Ext] audio change failed", err);
    }
});
