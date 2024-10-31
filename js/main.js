const sdstVersion = "1.0.0" //3110

redirect() //redirect sign/verify requests to user's local instance of sdstool 

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
    Storage.loadDatabase(async function (dbName, kdbString, password) {
        let loadedSuccessfully = await GUI.loadDatabaseFromString(dbName, kdbString, password, true)
        //update db name since the one in local storage can differ from the one in the encrypted db
        if(loadedSuccessfully) sdsTool.keyDatabase.setDbName(Storage.dbName())
    })

    //call initTabs() at the end to get right column spacing for database tables
    GUI.initTabs()
    GUI.hashRedirect() //open sign/verify tab based on request
    $("#loadingOverlay").hide()
})

function redirect() {    
    const ru = Settings.getStringSetting("settingsRedirectUrl")
    const hash = window.location.hash
    if(hash !== "" && ru !== null) {        
        try {
            location.replace(ru + hash)
        } catch(e) {
            console.log("ERR","redirect url ("+ru+") invalid",e)
        }
    }
}