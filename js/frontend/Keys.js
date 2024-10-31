GUI.initKeys = function (sdsTool) {
    GUI.initGenerateKey(sdsTool)
    GUI.initAddKey(sdsTool)
    GUI.initViewKey(sdsTool)
}

GUI.initGenerateKey = function (sdsTool) {
    //show/hide custom RNG seed material textarea depending on setting
    $("#settingsCustomRngSeedMaterial")[0].addEventListener("change", (ev) => {
        if(Settings.getBoolSetting("settingsCustomRngSeedMaterial")) {
            $("#generateKeyRngSeed").parent().show()
        } else {
            $("#generateKeyRngSeed").parent().hide()
        }
    })

    //generate key pair button action
    $("#generateKeyPairButton")[0].addEventListener("click", (ev) => {
        const alias = $('#generateAlias')[0].value.trim()
        const algorithm = $("#generateAlgorithm")[0].value
        const rngSeed = $('#generateKeyRngSeed')[0].value
        GUI.generateKeyPair(sdsTool, alias, algorithm, rngSeed)
    })

    //check that a valid algorithm is selected
    $("#generateAlgorithm")[0].addEventListener("change", (ev) => {
        const errLabel = $("label[for='generateAlgorithm'] > .error")[0]
        errLabel.style.display = $("#generateAlgorithm")[0].value === "" ? "block" : "none"
        $("#generateKeyPairButton")[0].disabled = $("#generateAlgorithm")[0].value === ""
    })
    $("#generateAlgorithm")[0].dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
}

GUI.generateKeyPair = async function (sdsTool, alias, algorithm, rngSeed) {
    //disable button until generation is finished
    $("#generateKeyPairButton")[0].disabled = true

    if(rngSeed !== "" && rngSeed.trim() === "") GUI.consolePrintWarn("RNG seed material only consists of white spaces. Falling back to WebCrypto API to generate seed material.")
    if(rngSeed.trim() === "") rngSeed = undefined

    try {
        const key = await sdsTool.generateKeyPair(algorithm, alias, rngSeed)
        const msg = alias => "Generated key pair '" + alias + "' with KeyId:\n" + key.keyId
        GUI.clearOutput("generateKey")
        GUI.printOutputSuccess("generateKey", msg(GUI.sanitize(key.alias)))
        GUI.consolePrint(msg(key.alias) + "\n", true)
        GUI.aliasAlreadyExistsWarning(alias, key.alias, "generateKey")

        //reset generate form
        $("#generateAlias")[0].value = ""
        if(Settings.getBoolSetting("settingsClearRngSeedAfterUse")) $("#generateKeyRngSeed")[0].value = ""

        Storage.updateDatabase("GUI.generateKeyPair")
    } catch(e) {
        GUI.consolePrintErr(e.message)
        GUI.clearOutput("generateKey")
        GUI.printOutputError("generateKey", e.message)
    } finally {
        $("#generateKeyPairButton")[0].disabled = false
    }
}

GUI.initAddKey = function (sdsTool) {
    //add key button action
    $("#addKeyButton")[0].addEventListener("click", (ev) => {
        const alias = $('#addKeyAlias')[0].value.trim()
        const key = $("#addKeyKey")[0].value
        const overwriteFlag = $("#addKeyOverwriteFlag")[0].checked
        GUI.addKey(sdsTool, alias, key, overwriteFlag)
    })

    //disable add key button if public key textarea is empty
    $("#addKeyButton")[0].disabled = $("#addKeyKey")[0].value.trim() === ""
    $("#addKeyKey")[0].addEventListener("input", (ev) => {
        $("#addKeyButton")[0].disabled = $("#addKeyKey")[0].value.trim() === ""
    })

    $("#addKeyKey")[0].addEventListener("change", (ev) => GUI.autoFormatJson("#addKeyKey"))
}

GUI.addKey = async function (sdsTool, alias, key, overwriteFlag) {
    //used if multiple keys are added, e.g. Bob (1/4), Bob (2/4), ...
    const aliasNo = (alias, i, n) => (alias !== undefined && alias !== "") ? alias + " (" + i + "/" + n + ")" : undefined

    $("#addKeyButton")[0].disabled = true
    GUI.clearOutput("addKey")

    try {
        const keyJson = JSON.parse(key)
        if(!Array.isArray(keyJson)) {
            if(alias !== undefined && alias !== "") keyJson.alias = alias
            await GUI.addSingleKeyJson(sdsTool, keyJson, overwriteFlag)
        } else {
            for(let i = 0; i < keyJson.length; i++) {
                if(alias !== undefined && alias !== "") keyJson[i].alias = aliasNo(alias, i + 1, keyJson.length)
                await GUI.addSingleKeyJson(sdsTool, keyJson[i], overwriteFlag, i + 1)
            }
        }
    } catch(e) {
        if(e instanceof SyntaxError) {
            let keys = key.split("\n\n").filter((x) => x.trim() !== "")
            if(keys.length === 1) {
                await GUI.addSingleKey(sdsTool, alias, keys[0], undefined, overwriteFlag)
            } else {
                for(let i = 0; i < keys.length; i++) {
                    await GUI.addSingleKey(sdsTool, aliasNo(alias, i + 1, keys.length), keys[i], undefined, overwriteFlag, i + 1)
                }
            }
        } else {
            console.log("[ERR]", e)
            const errMsg = "GUI.addKey() failed unexpectedly (" + e.message() + "). Check browser console (Ctrl+Shift+I) and filter for FATAL"
            GUI.printOutputError("addKey", errMsg)
            GUI.consolePrintErr(errMsg)
        }
    } finally {
        Storage.updateDatabase("GUI.addKey")
        $("#addKeyButton")[0].disabled = false
    }
}

GUI.addSingleKeyJson = async function (sdsTool, keyJson, overwriteFlag, index) {
    if(keyJson.publicKey === undefined && keyJson.privateKey === undefined) {
        const prefix = index !== undefined ? "Key #" + index + ": " : ""
        const errMsg = prefix + "Can't add JSON key because neither 'publicKey' nor 'privateKey' field exists"
        GUI.printOutputError("addKey", errMsg)
        GUI.consolePrintErr(errMsg + "\n")
    }

    let addedOn = keyJson.addedOn === undefined ? new Date() : new Date(keyJson.addedOn)
    if(keyJson.privateKey !== undefined) {
        await GUI.addSingleKey(sdsTool, keyJson.alias, keyJson.privateKey, addedOn, overwriteFlag, index)
    } else {
        await GUI.addSingleKey(sdsTool, keyJson.alias, keyJson.publicKey, addedOn, overwriteFlag, index)
    }
}

GUI.addSingleKey = async function (sdsTool, alias, keyContent, addedOn, overwriteFlag, index) {
    const prefix = index !== undefined ? "Key #" + index + ": " : ""

    if(!addedOn instanceof Date || !isFinite(addedOn)) addedOn = new Date()

    if(keyContent.startsWith("-----BEGIN PUBLIC KEY-----") || !keyContent.startsWith("-----")) {
        //add public key
        try {
            const key = await sdsTool.addPublicKey(keyContent, alias, addedOn, overwriteFlag)
            const msg = alias => prefix + "Added public key '" + alias + "' with KeyId:\n" + key.keyId
            GUI.printOutputSuccess("addKey", msg(GUI.sanitize(key.alias)))
            GUI.consolePrint(msg(key.alias) + "\n", true)
            GUI.aliasAlreadyExistsWarning(alias, key.alias, "addKey")
        } catch(e) {
            let alias = sdsTool.keyDatabase.getKeyById(e.keyId)?.alias
            if(alias === undefined) alias = ""
            let errMsg
            if(e instanceof UnknownAlgorithmError) {
                errMsg = alias => "Invalid public key or unknown algorithm"
            } else if(e instanceof KeyIdExistsError) {
                errMsg = alias => "Key already exists with alias '" + alias + "', KeyId:\n" + e.keyId
            } else if(e instanceof WasmBusyError) {
                errMsg = alias => "Wasm Busy, try again in a moment"
            } else {
                errMsg = alias => "Unexpected error:\n" + e.message
            }
            GUI.printOutputError("addKey", prefix + errMsg(GUI.sanitize(alias)))
            GUI.consolePrintErr(prefix + errMsg(alias))
        }
    } else {
        //add private key
        try {
            const key = await sdsTool.addPrivateKey(keyContent, alias, addedOn, overwriteFlag)
            const msg = prefix + "Added key pair '" + key.alias + "' with KeyId:\n" + key.keyId
            GUI.printOutputSuccess("addKey", msg)
            GUI.consolePrint(msg, true)
            GUI.aliasAlreadyExistsWarning(alias, key.alias, "addKey")
        } catch(e) {
            let alias = sdsTool.keyDatabase.getKeyById(e.keyId)?.alias
            if(alias === undefined) alias = ""
            let errMsg
            if(e instanceof UnknownAlgorithmError) {
                errMsg = alias => "Invalid private key or unknown algorithm"
            } else if(e instanceof InvalidPrivateKeyError) {
                errMsg = alias => "Invalid private key (failed to derive public key or validate key pair)"
            } else if(e instanceof KeyIdExistsError) {
                errMsg = alias => "Key already exists with alias '" + alias + "', KeyId:\n" + e.keyId
            } else if(e instanceof WasmBusyError) {
                errMsg = alias => "Wasm Busy, try again in a moment"
            } else {
                errMsg = alias => "Unexpected error:\n" + e.message
            }
            GUI.printOutputError("addKey", prefix + errMsg(GUI.sanitize(alias)))
            GUI.consolePrintErr(prefix + errMsg(alias))
        }
    }
}

GUI.initViewKey = function () {
    if($("#viewKeyPrivateKey")[0].value === "") {
        $("#viewKeyPrivateKeyDetails").hide()
        $("label[for='viewKeyCreated']")[0].innerText = "Added on"
    }
    $("#viewKeyButton")[0].addEventListener("click", GUI.viewKeyClose)
    GUI.viewKeyClose()
}

GUI.viewKey = function (keyDatabase, keyId) {
    const key = keyDatabase.getKeyById(keyId)
    if(key === undefined) return
    const isKeyPair = KeyDatabase.isKeyPair(key)

    //set data    
    $("#viewKeyKid")[0].value = keyId
    $("#viewKeyAlias")[0].value = key.alias
    $("#viewKeyAlgorithm")[0].value = key.algorithm
    $("#viewKeyPublicKey")[0].value = key.publicKey
    $("#viewKeyRaw")[0].value = JSON.stringify(key, undefined, 2)
    $("#viewKeyCreated")[0].value = GUI.dateToString(key.addedOn, Settings.getStringSetting("settingsDateFormat"))
    //$("#viewKeyColor")[0].style.background = keyIdToColor(keyId)

    if(isKeyPair) {
        $("#viewKeyPrivateKey")[0].value = key.privateKey
        $("#viewKeyPrivateKeyDetails").show()
    } else {
        $("#viewKeyPrivateKey")[0].value = ""
        $("#viewKeyPrivateKeyDetails").hide()
    }

    $("#viewKeyButton")[0].disabled = false

    //open keys/view
    GUI.openTab("keysNavi", "viewKey")
    if(GUI.activeTab("actionNavi") === "sign" //sign tab is open
        && isKeyPair
        && $("#signButton")[0].getAttribute("requestedKeys") === null //not a JSON sr where no key can be selected
        && keyId != $("#signSigningKey")[0].value  //key not already selected for signing
    ) {
        //if sign tab is open and selected key is a key pair then set it as signing key instead
        GUI.signSelectKey(keyId)
        $("#signSigningKey")[0].dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
    } else {
        GUI.openTab("actionNavi", "keys")
    }

}

GUI.viewKeyClose = function () {
    //set data    
    $("#viewKeyKid")[0].value = ""
    $("#viewKeyAlias")[0].value = ""
    $("#viewKeyAlgorithm")[0].value = ""
    $("#viewKeyPublicKey")[0].value = ""
    $("#viewKeyRaw")[0].value = ""
    $("#viewKeyCreated")[0].value = ""

    $("#viewKeyPrivateKey")[0].value = ""
    $("#viewKeyPrivateKeyDetails").hide()
    $("#viewKeyButton")[0].disabled = true
}

GUI.deleteKey = function (keyDatabase, keyId) {
    const key = keyDatabase.getKeyById(keyId)
    if(!Settings.getBoolSetting("settingsWarnBeforeDeletingKey") || window.confirm("Do you want to delete key '" + key.alias + "' with KeyId " + keyId + "?")) {
        keyDatabase.deleteKey(keyId)
        const msg = alias => "Deleted key '" + alias + "', KeyId:\n" + keyId
        GUI.clearOutput("database")
        GUI.printOutputSuccess("database", msg(GUI.sanitize(key.alias)))
        GUI.consolePrint(msg(key.alias) + "\n", true)
        Storage.updateDatabase("GUI.deleteKey")
    }
}

GUI.changeAlias = function (keyDatabase, keyId) {
    const aliasEl = $("#" + keyId + " > td > div")[0]
    const newAlias = aliasEl.innerText.trim()
    const oldAlias = keyDatabase.getKeyById(keyId).alias

    if(newAlias === oldAlias) return

    if(newAlias === "") {
        const errMsg = "Alias cannot be empty or contain only whitespaces"
        GUI.clearOutput("database")
        GUI.printOutputError("database", errMsg)
        GUI.consolePrintErr(errMsg + "\n")
        aliasEl.innerText = oldAlias
        return
    }

    if(newAlias.includes("\n") || newAlias.includes("\r")) {
        const errMsg = "Alias cannot contain line breaks"
        GUI.clearOutput("database")
        GUI.printOutputError("database", errMsg)
        GUI.consolePrintErr(errMsg + "\n")
        aliasEl.innerText = oldAlias
        return
    }

    if(keyDatabase.aliasExists(newAlias)) {
        const errMsg = (oldAlias, newAlias) => "Can't change alias from '" + oldAlias + "' to '" + newAlias + "' since it already exists"
        GUI.clearOutput("database")
        GUI.printOutputError("database", errMsg(GUI.sanitize(oldAlias), GUI.sanitize(newAlias)))
        GUI.consolePrintErr(errMsg(oldAlias, newAlias) + "\n")
        aliasEl.innerText = oldAlias
        return
    }
    keyDatabase.setAlias(keyId, newAlias)
    const msg = (oldAlias, newAlias) => "Changed alias from '" + oldAlias + "' to '" + newAlias + "'"
    GUI.clearOutput("database")
    GUI.printOutputSuccess("database", msg(GUI.sanitize(oldAlias), GUI.sanitize(newAlias)))
    GUI.consolePrint(msg(oldAlias, newAlias) + "\n", true)
    Storage.updateDatabase("GUI.changeAlias")
}

//location = generateKey or addKey
GUI.aliasAlreadyExistsWarning = function (alias, actualAlias, location) {
    if(alias !== undefined && alias !== "" && alias !== actualAlias) {
        const msg = (alias, actualAlias) => "Alias '" + alias + "' already exists, chose '" + actualAlias + "' instead"
        GUI.printOutputWarning(location, msg(GUI.sanitize(alias), GUI.sanitize(actualAlias)))
        GUI.consolePrintWarn(msg(alias, actualAlias) + "\n")
    }
}