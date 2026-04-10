const sdstVersion = "1.0.1" //2026/04/10

redirect() //redirect sign/verify requests to user's self-hosted instance of SDSTool 

let wasmWebTerm = new WasmWebTerm.default("./binaries", undefined, true)
let wasmWrapper = new WasmWrapper(wasmWebTerm)
let sdsTool = new SDSTool(wasmWrapper)

$(document).ready(async function () {
    GUI.setTheme() //load theme first to prevent lag

    let term = new Terminal() //init xterm.js terminal
    term.loadAddon(wasmWebTerm) //load wasm-webterm addon
    term.open(document.getElementById("xterm")) //render terminal into dom (invisible)

    Settings.init() //init app settings
    await GUI.init(sdsTool)
    Settings.settingsChanged() //inform GUI listeners that settings have been loaded

    //try to load database from local storage    
    Storage.initLoadDatabase(GUI.loadDatabaseCallback)

    //call initTabs() at the end to get right column spacing for database tables
    GUI.initTabs()

    $("#loadingOverlay").hide()
})

function redirect() {
    const ru = Settings.getStringSetting("settingsRedirectUrl")
    if(ru == null || ru == "") return //no redirect defined

    const mode = hashMode()
    if(mode == "S" || mode == "V") {
        try {
            location.replace(ru + window.location.hash)
        } catch(e) {
            console.error("redirect url (" + ru + ") invalid", e)
        }
    } else if(isPostRequest()) {
        /*
            Do not send redirectUrl to opener since the domain may
            identify the client. Act as a proxy instead that forwards
            the request and response between opener and user's instance.
        */
    }
}

/**
 * If SDSTool was called with a sign or verify request, this
 * returns a promise that resolves to the request. Otherwise,
 * it returns undefined.
 */
function getRequest() {
    if(isPostRequest()) {

        //wait for post request
        const onMessage = (ev, resolve) => resolve({
            ...ev.data,
            fromFragmentId: false,
            origin: ev.origin
        })

        return new Promise((resolve) => {
            addEventListener("message", (ev) => onMessage(ev, resolve))
            window.opener.postMessage({ isReady: true }, "*")
            // "*" => send ready signal to whatever origin opened this window            
            console.log("waiting for request via postMessage")
        })
    }

    const mode = hashMode()
    const arg = window.location.hash.slice(2) //request part of fragment identifier
    if(mode == "S") {
        //decode sign request from fragment identifier
        try {
            const signObj = JSON.parse(decodeURIComponent(arg))
            return Promise.resolve({
                ...signObj,
                type: "sign",
                fromFragmentId: true
            })
        } catch(e) {
            const err = new Error("Failed to parse sign request from fragment identifier: " + e.message)
            return Promise.reject(err)
        }
    }

    if(mode == "V") {
        //decode verify request from fragment identifier
        try {
            return Promise.resolve({
                type: "verify",
                fromFragmentId: true,
                verifyData: decodeURIComponent(arg)
            })
        } catch(e) {
            const err = new Error("Failed to parse verify request from fragment identifier: " + e.message)
            return Promise.reject(err)
        }
    }

    //no request
    return undefined
}

function hashMode() {
    const mode = window.location.hash.slice(1, 2)
    return ["S", "V", "P"].includes(mode) ? mode : undefined
}

function isPostRequest() {
    return hashMode() == "P" && window.opener !== null
}