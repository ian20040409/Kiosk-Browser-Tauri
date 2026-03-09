window.addEventListener("GetSubtitleTracksList",()=>{
    try{
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
        const SubstitleTracksObject = player.getTextTrackList()
        window.postMessage({
            type: "FROM_SUBSTITLECHANGE_SCRIPT",
            substitleTracks: SubstitleTracksObject,
        }, "*");
    } catch (err){
        console.error("[Netflix Ext] Get Substitle TracksList failed\"", err)
    }
})

// change audio language
window.addEventListener("netflixSubtitleChange", (e) => {
    console.log("e",e)
    const SubstileLanguageKey = e.detail;
    console.log("SubstileLanguageKey", SubstileLanguageKey)
    try {
        const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
        const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
        player.setTextTrack(player.getTextTrackList()[SubstileLanguageKey])

    } catch (err) {
        console.error("[Netflix Ext] Substile change failed", err);
    }
});
