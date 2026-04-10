class Storage {

    static initLoadDatabase(callback) {
        const isNewSession = sessionStorage.getItem("storage/sessionStarted") === null
        const useLocalStorage = Settings.getBoolSetting("settingsUseLocalStorage")

        if(Storage.databaseExists()) {
            GUI.consolePrint("Database '" + Storage.dbName() + "' found in local storage.", true)
        } else {
            //no database in storage -> set password to "" to prevent auto-saving
            console.debug("No db in storage -> remove password")
            GUI.setPassword("")
        }


        //only try to load db from local storage on session start and
        //when resp. setting is turned on and a database exists in local storage
        if((Settings.getBoolSetting("settingsAlwaysLoadLocalDb") || isNewSession)
            && useLocalStorage && Storage.databaseExists()) {
            sessionStorage.setItem("storage/sessionStarted", "true")
            Storage.loadDatabase(callback, true)
        }
    }

    static loadDatabase(callback, autoPw) {
        //try to load from local storage        
        const kdbString = localStorage.getItem("storage/database")

        if(autoPw && Settings.getBoolSetting("settingsUseAutoPassword") && GUI.getDatabasePassword() !== null) {
            //does not work on Chromium: https://issues.chromium.org/issues/41288742
            //https://stackoverflow.com/questions/60669613/read-value-from-chrome-autofill-with-javascript-chrome-extension
            callback(Storage.dbName(), kdbString, GUI.getDatabasePassword())
        } else {
            //ask for password & call callback (only if prompt was closed by clicking ok)
            GUI.passwordPrompt(Storage.dbName(), "Password for '" + Storage.dbName() + "'", function (ok) {
                if(ok) callback(Storage.dbName(), kdbString, GUI.getDatabasePassword())
            })
        }
    }

    //called whenever a GUI action is completed that has changed the key database
    //completed => WASM not busy anymore
    static async updateDatabase(changeEvent) {
        const implies = (x, y) => !x || y

        const databaseExisted = Storage.databaseExists()
        const useLocalStorage = Settings.getBoolSetting("settingsUseLocalStorage")
        const dbName = sdsTool.keyDatabase.getDbName()
        const password = GUI.getDatabasePassword()

        //return if resp. setting is not on or password not set or
        //db exists in local storage but guids do no match (=> different dbs)
        if(!useLocalStorage || password === null ||
            !implies(databaseExisted, Storage.guid() === sdsTool.keyDatabase.getGuid())) return

        if(databaseExisted && changeEvent === "dbNameChanged") {
            //if dbName changes, only update it in storage instead of re-encrypting the whole db
            localStorage.setItem("storage/dbName", dbName)
            GUI.updateDataseInStorageDisplay()
            return
        }

        try {
            localStorage.setItem("storage/dbName", dbName)
            localStorage.setItem("storage/createdOn", sdsTool.keyDatabase.getCreatedOn().valueOf())
            localStorage.setItem("storage/guid", sdsTool.keyDatabase.getGuid())
            localStorage.setItem("storage/database", await sdsTool.encryptKeyDatabase(password))

            if(!databaseExisted) {
                const msg = dbName => "Saved database '" + dbName + "' to browser's local storage."
                GUI.clearOutput("database")
                GUI.printOutputSuccess("database", msg(GUI.sanitize(dbName)))
                GUI.consolePrint(msg(dbName) + "\n", true)

                GUI.updateDataseInStorageDisplay()
            } else {
                GUI.consolePrint("Updated db in local storage\n", true)
            }
        } catch(e) {
            console.error("changeEvent", changeEvent, "excepction", e)
            const verb = databaseExisted ? "update" : "save"
            const errMsg = dbName => "Failed to " + verb + " database '" + dbName + "' in browser's local storage because:\n" + e.message
            GUI.clearOutput("database")
            GUI.printOutputError("database", errMsg(GUI.sanitize(dbName)))
            GUI.consolePrintErr(errMsg(dbName) + "\n")
        }

    }

    static clear() {
        if(!Storage.databaseExists()) return

        const dbName = Storage.dbName()
        localStorage.removeItem("storage/database")
        localStorage.removeItem("storage/dbName")
        localStorage.removeItem("storage/createdOn")
        localStorage.removeItem("storage/guid")

        const msg = "Deleted database '" + GUI.sanitize(dbName) + "' from browser's local storage."
        GUI.clearOutput("database")
        GUI.printOutputSuccess("database", msg)
        GUI.consolePrint(msg + "\n", true)

        GUI.updateDataseInStorageDisplay()
    }

    static databaseExists() {
        return localStorage.getItem("storage/database") !== null
    }

    static dbName() {
        return localStorage.getItem("storage/dbName")
    }

    static guid() {
        return localStorage.getItem("storage/guid")
    }

    static dbInStorageIsLoaded() {
        return localStorage.getItem("storage/guid") === sdsTool.keyDatabase.getGuid()
    }
}
