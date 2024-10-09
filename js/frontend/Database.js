GUI.initDatabase = function (sdsTool) {
    const keyDatabase = sdsTool.keyDatabase
    const focusOutOnEnter = function (e) {
        if(e.keyCode == 13) {
            e.preventDefault()
            document.activeElement.blur()
        }
    }

    //refresh tables' views when keyDatabase changes
    keyDatabase.onChange(GUI.refreshDataTablesOnKeyDatabaseChange)

    //redraw tables when settingsEntriesPerPage changes
    $("#settingsEntriesPerPage")[0].addEventListener("change", (ev) => {
        const x = Settings.getIntSetting("settingsEntriesPerPage")
        if(!Number.isNaN(x)) {
            $('#yourKeysTable').DataTable().page.len(x).draw()
            $('#othersKeysTable').DataTable().page.len(x).draw()
        }
    })

    //destroy and redraw table when settingsDateFormat changes
    $("#settingsDateFormat")[0].addEventListener("change", (ev) => {
        const x = Settings.getIntSetting("settingsEntriesPerPage")
        const ykp = $('#yourKeysTable').DataTable().page()
        const okp = $('#othersKeysTable').DataTable().page()
        $('#yourKeysTable').DataTable().destroy()
        $('#othersKeysTable').DataTable().destroy()

        //both tables need to be displayed to get proper column spacing
        $('#yourKeys').show()
        $('#othersKeys').show()

        $('#yourKeysTable').DataTable(GUI.dataTableSettings(sdsTool.keyDatabase, true)).page.len(x).draw()
        $('#othersKeysTable').DataTable(GUI.dataTableSettings(sdsTool.keyDatabase, false)).page.len(x).draw()

        GUI.syncDatabaseSearchInputs()
        GUI.openTab("dbNavi", "yourKeys")
    })

    //set db name and update it on change
    $("#keyDatabaseName")[0].value = keyDatabase.dbName
    $("#keyDatabaseName")[0].addEventListener("change", (ev) => {
        sdsTool.keyDatabase.setDbName($("#keyDatabaseName")[0].value)
        Storage.updateDatabase("dbNameChanged")
    })
    $("#keyDatabaseName").on("keydown", focusOutOnEnter)

    //submit password on enter
    /*$("#dbPassword")[0].onkeydown = function (ev) {    
        if(ev.keyCode == 13) {
            $("#passwordPromptOk")[0].dispatchEvent(new Event("click", { "view": window, "bubbles": true }))
        }
    }*/

    //init key counts
    $("#yourKeysCount")[0].innerText = keyDatabase.getKeyPairs().length
    $("#othersKeysCount")[0].innerText = keyDatabase.getPublicKeys().length

    //set up and render tables
    $('#yourKeys').show()
    $('#othersKeys').show()

    $('#yourKeysTable').DataTable(GUI.dataTableSettings(keyDatabase, true)).draw()
    $('#othersKeysTable').DataTable(GUI.dataTableSettings(keyDatabase, false)).draw()

    //when an alias is edited, prevent line break on enter (drop focus instead)
    $("#yourKeysTable tbody").on("keydown", ".rowAliasDiv", focusOutOnEnter)
    $("#othersKeysTable tbody").on("keydown", ".rowAliasDiv", focusOutOnEnter)

    GUI.syncDatabaseSearchInputs()

    //set up db butons
    $("#dbNewButton")[0].addEventListener("click", GUI.newDatabase)
    $("#dbSaveButton")[0].addEventListener("click", ev => GUI.saveDatabase(sdsTool))
    $("#dbLoadButton")[0].addEventListener("click", ev => $("#dbLoadFile")[0].click())
    $("#dbDeleteButton")[0].addEventListener("click", function () {
        if(confirm("Do you want to delete the database '" + Storage.dbName() + "' in your browser's local storage?"))
            Storage.clear()
    })
    $("#dbLoadFile")[0].addEventListener("change", ev => GUI.loadDatabase(sdsTool))
    GUI.updateDatabasePasswordButton()
    GUI.updateDbDeleteButtonState()

    $("#showPassword")[0].addEventListener("change", function (ev) {
        $("#dbPassword")[0].type = $("#showPassword")[0].checked ? "text" : "password"
    })
}

GUI.newDatabase = function () {
    if(confirm("Do you want to create a new database? This will delete the current database. Make sure to save it beforehand.")) {
        //Storage.clear()
        GUI.initOutput() //delete all output messages
        GUI.viewKeyClose()
        sdsTool.loadKeyDatabase(new KeyDatabase())
        GUI.consolePrint("New database created\n", true)
        //location.reload()
    }
}

GUI.saveDatabase = async function (sdsTool) {
    GUI.disableDbButtons()
    try {
        const password = GUI.getDatabasePassword()
        if(password !== null || confirm("No password is set. This will save your key database as unencrypted file. Are you sure you want to continue?")) {
            const dbContents = await sdsTool.encryptKeyDatabase(password)

            let el = document.createElement("a")
            el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(dbContents))
            el.setAttribute("download", sdsTool.keyDatabase.getDbName() + ".sdst")
            el.style.display = "none"
            el.type = "file"
            document.body.appendChild(el)
            el.click()
            document.body.removeChild(el)
        }
    } finally {
        GUI.enableDbButtons()
    }
}

GUI.loadDatabase = function (sdsTool) {
    GUI.disableDbButtons()
    const selectedFile = $("#dbLoadFile")[0].files[0]
    $("#dbLoadFileForm")[0].reset() //reset to recognize if the same file is loaded twice in a row
    if(selectedFile) {
        let reader = new FileReader()
        reader.readAsText(selectedFile, "UTF-8")
        reader.onload = async function (ev) {
            let kdbString = ev.target.result
            if(SDSTool.isEncryptedKeyDatabase(kdbString)) {
                //load encrypted database
                GUI.passwordPrompt("Password for file '" + selectedFile.name + "'", async function (ok) {
                    const password = GUI.getDatabasePassword()                    
                    if(!ok || password === null) {
                        //cancelled loading db from file
                        GUI.consolePrint("Cancelled loading encrypted database from file '" + selectedFile.name + "'", true)
                        GUI.enableDbButtons()
                        return
                    }
                    await GUI.loadDatabaseFromString(selectedFile.name, kdbString, password)
                    Storage.updateDatabase("dbLoadedFromFile")
                })

            } else {
                //load unencrypted database
                await GUI.loadDatabaseFromString(selectedFile.name, kdbString)
                Storage.updateDatabase("dbLoadedFromFile")
            }
        }
        reader.onerror = function (ev) {
            console.log("[ERR]", ev)
            const errMsg = "Can't load database from file '" + selectedFile.name + "'. Failed to read file."
            GUI.clearOutput("database")
            GUI.printOutputError("database", errMsg)
            GUI.consolePrintErr(errMsg + "\n")
            GUI.enableDbButtons()
        }
    }
}

GUI.loadDatabaseFromString = async function (dbName, kdbString, password, fromStorage) {
    let res = false
    try {
        const kdb = await sdsTool.decryptKeyDatabase(kdbString, password)
        sdsTool.loadKeyDatabase(kdb)
        //sync dbName in keyDatabase with the one in local storage
        if(fromStorage) sdsTool.keyDatabase.dbName = dbName

        const msg = fromStorage === true ?
            "Loaded database '" + dbName + "'" :
            "Loaded database from file '" + dbName + "'"

        GUI.clearOutput("database")
        GUI.printOutputInfo("database", msg)
        GUI.consolePrint(msg + "\n", true)
        res = true
    } catch(e) {
        const errMsg = fromStorage === true ?
            "Failed to load database '" + dbName + "' because:\n" + e.message :
            "Failed to load database from file '" + dbName + "' because:\n" + e.message

        GUI.clearOutput("database")
        GUI.printOutputError("database", errMsg)
        GUI.consolePrintErr(errMsg + "\n")
        res = false
    } finally {
        GUI.enableDbButtons()
        return res
    }
}

GUI.disableDbButtons = function () {
    const buttons = ["dbSaveButton", "dbLoadButton", "dbNewButton"]
    buttons.forEach((x) => $("#" + x)[0].disabled = true)
}

GUI.enableDbButtons = function () {
    const buttons = ["dbSaveButton", "dbLoadButton", "dbNewButton"]
    buttons.forEach((x) => $("#" + x)[0].disabled = false)
}

GUI.syncDatabaseSearchInputs = function () {
    //sync search input for your keys & others keys
    const yourFilterInput = $("#yourKeysTable_filter > label > input")[0]
    const othersFilterInput = $("#othersKeysTable_filter > label > input")[0]
    yourFilterInput.addEventListener("input", (ev) => {
        if(yourFilterInput.value !== othersFilterInput.value) {
            othersFilterInput.value = yourFilterInput.value
            $('#othersKeysTable').DataTable().search(yourFilterInput.value).draw()
        }
    })
    othersFilterInput.addEventListener("change", (ev) => {
        if(yourFilterInput.value !== othersFilterInput.value) {
            yourFilterInput.value = othersFilterInput.value
            $('#yourKeysTable').DataTable().search(othersFilterInput.value).draw()
        }
    })
}

GUI.refreshDataTablesOnKeyDatabaseChange = function (functionName, data) {
    let yourRow, othersRow

    switch(functionName) {
        case "reload":
            const keyDatabase = data
            const x = Settings.getIntSetting("settingsEntriesPerPage")
            $('#yourKeysTable').DataTable().destroy()
            $('#othersKeysTable').DataTable().destroy()

            //both tables need to be displayed to get proper column spacing
            $('#yourKeys').show()
            $('#othersKeys').show()

            $('#yourKeysTable').DataTable(GUI.dataTableSettings(keyDatabase, true)).page.len(x).draw()
            $('#othersKeysTable').DataTable(GUI.dataTableSettings(keyDatabase, false)).page.len(x).draw()

            //update db name & key counts
            $("#keyDatabaseName")[0].value = keyDatabase.dbName
            $("#yourKeysCount")[0].innerText = keyDatabase.getKeyPairs().length
            $("#othersKeysCount")[0].innerText = keyDatabase.getPublicKeys().length

            GUI.syncDatabaseSearchInputs()
            GUI.openTab("dbNavi", "yourKeys")
            break

        case "addKey":
            if(KeyDatabase.isKeyPair(data)) {
                $("#yourKeysTable").DataTable().row.add(data).draw()
                $("#yourKeysCount")[0].innerText = Number($("#yourKeysCount")[0].innerText) + 1
            } else {
                $("#othersKeysTable").DataTable().row.add(data).draw()
                $("#othersKeysCount")[0].innerText = Number($("#othersKeysCount")[0].innerText) + 1
            }
            break

        case "deleteKey":
            //data = keyId
            yourRow = $("#yourKeysTable").DataTable().row("#" + data)
            othersRow = $("#othersKeysTable").DataTable().row("#" + data)
            if(yourRow[0].length === 1) {
                yourRow.remove().draw(false)
                $("#yourKeysCount")[0].innerText = Number($("#yourKeysCount")[0].innerText) - 1
            } else {
                othersRow.remove().draw(false)
                $("#othersKeysCount")[0].innerText = Number($("#othersKeysCount")[0].innerText) - 1
            }
            //only -1 if it existed in key
            break

        case "setAlias":
            //data = key
            yourRow = $('#yourKeysTable').DataTable().row("#" + data.keyId)
            othersRow = $('#othersKeysTable').DataTable().row("#" + data.keyId)
            if(yourRow[0].length === 1) {
                yourRow.data(data) //add draw here if alias can be changed from somewhere else than in the table
            } else {
                othersRow.data(data)
            }
            break

        case "setDbName":
            $("#keyDatabaseName")[0].value = data
            break

    }
}

GUI.dataTableSettings = function (keyDatabase, yourKeys) {
    //columns (data, hidden data to search (keyId), order/search/filter lens, action columns (view, delete) )

    return {
        "data": yourKeys ? keyDatabase.getKeyPairs() : keyDatabase.getPublicKeys(),
        "rowId": "keyId",
        "columns": [
            {
                "data": "alias",
                "width": "33%",
                "render": function (data, type, row) {
                    const alias = GUI.sanitize(data)
                    return '<div class="rowAliasDiv" contenteditable="true" spellcheck="false" onFocusOut="GUI.changeAlias(sdsTool.keyDatabase,\'' + row.keyId + '\')">' + alias + '</div>'
                }
            },
            { "data": "publicKey" },
            { "data": "keyId" },
            {
                "data": "algorithm",
                "width": "23%"
            },
            {
                "data": "addedOn",
                "render": function (data, type, row) {
                    if(type === "display" || type === "filter") {
                        return GUI.dateToString(data, Settings.getStringSetting("settingsDateFormat"))
                    } else {
                        return data === undefined || isNaN(data.valueOf()) ? "" : data.valueOf()
                    }
                }
            },
            {
                "data": null,
                "render": function (data, type, row) {
                    return '<a class="emoji smallFontSize" onClick="GUI.viewKey(sdsTool.keyDatabase,\'' + row.keyId + '\')">🔍</a>'
                }
            },
            {
                "data": null,
                "render": function (data, type, row) {
                    return '<a class="emoji smallFontSize" onClick="GUI.deleteKey(sdsTool.keyDatabase,\'' + row.keyId + '\')">❌</a>'
                }
            }
        ],
        "columnDefs": [
            {
                "targets": [1, 2],
                "visible": false,
                "searchable": true
            },
            {
                "targets": [5, 6],
                "orderable": false,
                "searchable": false,
                "className": "center"
            }
        ],
        "language": {
            "search": "",
            "searchPlaceholder": "Search",
            "emptyTable": yourKeys ? "You have no key pairs, try generating one." : "You have no public keys, try adding one."
        },
        "ordering": true,
        "pageLength": 10,
        "dom": 'fp<t>'
    }
}


/* datbase password related */

GUI.getDatabasePassword = function () {
    const pw = $("#dbPassword")[0].value
    return pw === "" ? null : pw
}

GUI.passwordPrompt = function (text, callback) {
    const oldPassword = GUI.getDatabasePassword()
    const state = callback !== undefined ? "load" :
        (GUI.getDatabasePassword() === null ? "set" : "change")
    
    $("label[for='dbPassword']")[0].innerText = text
    $("#passwordPromptOk")[0].onclick = function () {
        const pwChanged = oldPassword !== $("#dbPassword")[0].value
        const spw = $("#showPassword")[0]
        spw.checked = false
        spw.dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
        GUI.closePasswordPrompt(true, pwChanged, state, callback)
    }
    $("#passwordPromptCancel")[0].onclick = function () {
        //reset to old password if it was changed before clicking cancel
        $("#dbPassword")[0].value = oldPassword === null ? "" : oldPassword
        const spw = $("#showPassword")[0]
        spw.checked = false
        spw.dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
        GUI.closePasswordPrompt(false, false, state, callback)
    }

    $("#passwordOverlay").show()
    $("#dbPassword")[0].focus()
}

GUI.closePasswordPrompt = function (ok, pwChanged, state, callback) {
    const noPassword = GUI.getDatabasePassword() === null

    if(state === "load") {
        callback(ok)
    } else {
        //state is set or change
        if(ok) {
            if(state === "set" && !noPassword) {
                const msg = "New password was set"
                GUI.clearOutput("database")
                GUI.printOutputInfo("database", msg)
                GUI.consolePrint(msg + "\n", true)
            } else if(state === "change") {
                const msg = noPassword ? "Removed password"
                    : (pwChanged ? "Changed password" : "Password was not changed")
                GUI.clearOutput("database")
                GUI.printOutputInfo("database", msg)
                GUI.consolePrint(msg + "\n", true)
            }

            if(!noPassword) Storage.updateDatabase("GUI.closePasswordPrompt")
        }

    }

    GUI.updateDatabasePasswordButton()
    $("#dbSetPasswordButton")[0].innerText = noPassword ? "Set password" : "Change password"
    $("#passwordOverlay").hide()
}

GUI.updateDatabasePasswordButton = function () {
    const noPassword = GUI.getDatabasePassword() === null
    const label1 = noPassword ? "Set password" : "Change password"
    const label2 = noPassword ? "Set database password" : "Change database password"
    $("#dbSetPasswordButton")[0].innerText = label1
    $("#dbSetPasswordButton")[0].onclick = () => GUI.passwordPrompt(label2)
}


/* misc */

GUI.updateDbDeleteButtonState = function () {
    if(Storage.databaseExists()) {
        $("#dbDeleteButton")[0].disabled = false
    } else {
        $("#dbDeleteButton")[0].disabled = true
    }
}