/*
  UI functions:
    - list of selectable signing keys filtered by accepted algorithms
    - if "requestSignaturesFrom" is present in JSON sr disable selection of signing key
    - show/hide custom rng seed material
    - show/hide digest method selection
    - show/hide error messages
*/


GUI.initSign = function (sdsTool) {
    /*
        register event listener to update UI parts:
        order for #signData is important because GUI.signUpdateUI attaches attributes
        "showDmSelect" and "showRngSeed" to #signButton which are read by 
        GUI.signCustomRngSeed and GUI.signDigestMethodSelect
        (first signUpdateUI, then signCustomRngSeed/signDigestMethodSelect)
    */

    $("#signData")[0].addEventListener("change", ev => GUI.autoFormatJson("#signData"))
    $("#settingsShowAdvancedOptions")[0].addEventListener("change", ev => {
        if(Settings.getBoolSetting("settingsShowAdvancedOptions")) {
            $("#signAdvancedOptions").show()
        } else {
            $("#signAdvancedOptions").hide()
        }
    })

    $("#signCopyButton")[0].addEventListener("click", ev => {
        if($("#signCopyButton")[0].hasAttribute("callback")) {
            //send to callback url where sign request came from
            const url = $("#signCopyButton")[0].getAttribute("callback")
            window.location.assign(url + encodeURIComponent($("#signData")[0].value))
        } else {
            //copy to clipboard
            let copyText = document.getElementById("signData");
            copyText.select()
            copyText.setSelectionRange(0, 99999)
            navigator.clipboard.writeText(copyText.value)

            $("#signCopyButton")[0].focus()
            $("#signCopyButton")[0].innerText = 'Copied ✓'
            $("#signCopyButton")[0].disabled = true
            setTimeout(function () {
                $("#signCopyButton")[0].innerText = 'Copy'
                $("#signCopyButton")[0].disabled = false
            }, 350)
        }
    })

    //reset digest method to default (sha256) if choosing dm setting is disabled
    $("#settingsChooseDigest")[0].addEventListener("change", ev => {
        if(!Settings.getBoolSetting("settingsChooseDigest")) {
            $("#signDigestMethod")[0].value = "sha256"
        }
    })

    //update sign ui when sign data or keydatabase changes
    $("#signData")[0].addEventListener("change", ev => GUI.signUpdateUI(sdsTool, "signData"))
    $("#signSigningKey")[0].addEventListener("change", ev => GUI.signUpdateUI(sdsTool, "signSigningKey"))
    $("#signAsPlainText")[0].addEventListener("change", ev => GUI.signUpdateUI(sdsTool, "signAsPlainText"))
    sdsTool.keyDatabase.onChange((fn, key) => {
        if(["addKey", "deleteKey", "setAlias", "reload"].includes(fn)) GUI.signUpdateUI(sdsTool, fn)
    })

    //show/hide custom RNG seed material based on setting, selected signing key and sign data (can influence signing key)
    $("#settingsCustomRngSeedMaterial")[0].addEventListener("change", ev => GUI.signCustomRngSeed(sdsTool.keyDatabase))
    $("#signSigningKey")[0].addEventListener("change", ev => GUI.signCustomRngSeed(sdsTool.keyDatabase))
    $("#signData")[0].addEventListener("change", ev => GUI.signCustomRngSeed(sdsTool.keyDatabase))

    //show/hide digest method selection based on setting, selected signing key and sign data (can influence signing key)
    $("#settingsChooseDigest")[0].addEventListener("change", ev => GUI.signDigestMethodSelect(sdsTool.keyDatabase))
    $("#signSigningKey")[0].addEventListener("change", ev => GUI.signDigestMethodSelect(sdsTool.keyDatabase))
    $("#signData")[0].addEventListener("change", ev => GUI.signDigestMethodSelect(sdsTool.keyDatabase))

    //set up sign button action
    $("#signButton")[0].addEventListener("click", ev => {
        const data = $("#signData")[0].value
        const keyId = $("#signSigningKey")[0].value
        const digestMethod = $("#signDigestMethod")[0].value
        const rngSeedMaterial = $("#signRngSeed")[0].value
        const signWithKeyId = Settings.getBoolSetting("settingsSignWithKeyId")
        const signAsPlainText = $("#signAsPlainText")[0].checked

        GUI.sign(sdsTool, keyId, data, digestMethod, rngSeedMaterial, signWithKeyId, signAsPlainText)
    })

    //init UI
    GUI.signUpdateUI(sdsTool, "init")
}

GUI.sign = async function (sdsTool, keyId, data, digestMethod, rngSeedMaterial, signWithKeyId, signAsPlainText) {
    //if user clicks on sign button right after pasting data, fire change event
    if(GUI.signingNotPossible(sdsTool)) return

    const checkJsr = str => {
        try {
            return SDSTool.validateJsonSignRequest(JSON.parse(str))
        } catch(e) {
            return undefined
        }
    }

    const button = $("#signButton")[0]
    button.disabled = true
    let key = sdsTool.keyDatabase.getKeyById(keyId)
    digestMethod = digestMethod === "" ? undefined : digestMethod
    rngSeedMaterial = rngSeedMaterial === "" ? undefined : rngSeedMaterial
    const jsr = checkJsr(data)

    try {
        if(jsr !== undefined && !signAsPlainText) {
            //valid JSON sign request            
            const signedJsr = await sdsTool.signJsonSignRequest(key, jsr, signWithKeyId, digestMethod, rngSeedMaterial)
            $("#signData")[0].value = JSON.stringify(signedJsr, undefined, 2)
            GUI.clearOutput("sign")
            if(jsr.requestSignaturesFrom === undefined) {
                const msg = alias => "Signed JSON sign request with key '" + alias + "'"                 
                const alias = key?.alias === undefined ? "" : key.alias
                GUI.printOutputSuccess("sign", msg(GUI.sanitize(alias)))
                GUI.consolePrint(msg(alias) + "\n", true)
            } else {      
                const msg = aliases => "Signed JSON sign request with key(s): " + aliases.map(a => "'"+a+"'").join(", ") + ""        
                const aliases = jsr.requestSignaturesFrom.map(kid =>sdsTool.keyDatabase.getKeyById(kid)?.alias).filter(a => a !== undefined)
                GUI.printOutputSuccess("sign", msg(aliases.map(a => GUI.sanitize(a))))
                GUI.consolePrint(msg(aliases) + "\n", true)                
            }
        } else {
            //plain text
            if(Settings.getBoolSetting("settingsNormalizePlainText")) data = normalizePlainText(data)
            if(Settings.getBoolSetting("settingsAppendNewlinePlainText")) data += "\n"

            let endingPhrase = Settings.getBoolSetting("settingsUseShortEndingPhrase") ? SDSTool.defaultEndingPhrases()[1] : SDSTool.defaultEndingPhrases()[0]
            if(Settings.getBoolSetting("settingsBreakAfterEndingPhrase")) endingPhrase += "\n"
            const keyIdPrefixLength = Settings.getBoolSetting("settingsKeyIdPrefixPlainText") ? 12 : undefined
            $("#signData")[0].value =
                await sdsTool.signPlainText(key, data, endingPhrase, signWithKeyId, digestMethod, rngSeedMaterial, keyIdPrefixLength)

            const msg = alias => "Signed plain text with key '" + alias + "'"
            GUI.clearOutput("sign")
            GUI.printOutputSuccess("sign", msg(GUI.sanitize(key.alias)))
            GUI.consolePrint(msg(key.alias) + "\n", true)
        }

        //clear rng seed material after signing
        if(Settings.getBoolSetting("settingsClearRngSeedAfterUse")) $("#signRngSeed")[0].value = ""

    } catch(e) {
        console.log("[ERR]", e)
        const errMsg = e.reason !== undefined ?
            e.message + ":\n" + e.reason :
            "Failed to sign because:\n" + e.message
        GUI.clearOutput("sign")
        GUI.printOutputError("sign", errMsg)
        GUI.consolePrintErr(errMsg + "\n")
    } finally {
        button.disabled = false
    }
}

GUI.signUpdateUI = function (sdsTool, event) {
    const button = $("#signButton")[0]

    if(event !== "signSigningKey") {
        //reset UI
        button.innerText = "Sign"
        button.removeAttribute("requestedKeys")
        button.removeAttribute("showDmSelect")
        button.removeAttribute("showRngSeed")
        $("#signSigningKey").parent().show() //show signing key select
        $("label[for='signData'] > .error").hide() //hide all error labels    

        const signAsPlainText = $("#signAsPlainText")[0].checked
        const jsonObj = (function () {
            try {
                return { "res": JSON.parse($("#signData")[0].value) }
            } catch(e) {
                return { "err": e }
            }
        })()

        if(signAsPlainText || jsonObj.err !== undefined) {
            //Accepted algorithms and digest methods for plain text 
            //can be specified via attributes attached to #signData.
            //This is used for plain text sign requests from other websites
            const sd = $("#signData")[0]
            if(sd.hasAttribute("acceptedAlgorithms")) {
                const acceptedAlgs = sd.getAttribute("acceptedAlgorithms").split(";")
                GUI.signPopulateSigningKey(sdsTool.keyDatabase, acceptedAlgs)
            } else {
                GUI.signPopulateSigningKey(sdsTool.keyDatabase)
            }
            if(sd.hasAttribute("acceptedDigestMethods")) {
                const acceptedDMs = sd.getAttribute("acceptedDigestMethods").split(";")
                GUI.signPopulateDigestMethod(acceptedDMs)
            } else {
                GUI.signPopulateDigestMethod()
            }
        } else {
            //data to sign is valid json string
            try {
                const jsr = SDSTool.validateJsonSignRequest(jsonObj.res)
                if(jsr.requestSignaturesFrom !== undefined) {
                    //ignore acceptedAlgorithms and acceptedDigestMethods if they exist
                    GUI.signPopulateSigningKey(sdsTool.keyDatabase, undefined, jsr.requestSignaturesFrom)
                    GUI.signPopulateDigestMethod()
                } else {
                    GUI.signPopulateSigningKey(sdsTool.keyDatabase, jsr.acceptedAlgorithms)
                    if(jsr.acceptedDigestMethods !== undefined) {
                        GUI.signPopulateDigestMethod(jsr.acceptedDigestMethods)
                    } else {
                        GUI.signPopulateDigestMethod([SDSTool.defaultDigestMethod()])
                    }
                }

            } catch(e) {
                //invalid json sr
                console.log("[ERR]", e)
                const errLabel = $("#signErrInvalidJsonSr")
                const info = e.reason !== undefined ? e.reason : e.message
                errLabel[0].title = info
                errLabel.show()
            }
        }
    }

    button.disabled = GUI.signingNotPossible(sdsTool)
}

GUI.signingNotPossible = function (sdsTool) {
    //if JSON sr with requestedSignaturesFrom field then signing 
    //is possible iff at least one requested key exists in the db
    if($("#signButton")[0].getAttribute("requestedKeys") !== null) {
        reqKeys = JSON.parse($("#signButton")[0].getAttribute("requestedKeys"))
        return reqKeys.length === 0
    }

    const signAsPlainText = $("#signAsPlainText")[0].checked
    const key = sdsTool.keyDatabase.getKeyById($("#signSigningKey")[0].value)
    const keyType = key === undefined ? "" : AlgorithmNames.algorithmType(key.algorithm)
    const showDmSelect = $("#signButton")[0].hasAttribute("showDmSelect") //requested from with at least one non-ed key

    return key === undefined   //no key to sign exists
        //no supported digest method is accepted and non-ed key is selected or requestedFrom contains a non-ed key
        || (!signAsPlainText && $("#signDigestMethod")[0].value === "" && (showDmSelect || keyType !== "ed"))
        //some error message is shown
        || $("label[for='signData'] > .error").toArray().find(x => x.checkVisibility()) !== undefined
}

GUI.signSelectKey = function (keyId) {
    if(keyId === undefined || keyId === "") return

    const sel = $("#signSigningKey")[0]
    const legalKeys = [...$("#signSigningKey")[0].options].map(x => x.value)
    if(legalKeys.includes(keyId)) {
        sel.value = keyId
        sel.dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
    }
}

//populate signing key select with legal keys or 
//hide it for "requestSignaturesFrom" and attach attributes to sign button 
GUI.signPopulateSigningKey = function (keyDatabase, acceptedAlgorithms, requestFrom) {
    const sel = $("#signSigningKey")[0]
    const button = $("#signButton")[0]
    const lastSelectedKeyId = sel.value

    if(requestFrom !== undefined) {
        //JSON sign request with requestSignaturesFrom field
        $("#signSigningKey").parent().hide()

        const requestedKeys = keyDatabase.getKeyPairs().filter(k => requestFrom.includes(k.keyId))
        if(requestedKeys.length === 0) $("#signErrRequestedKeysMissing").show()

        button.innerText = requestFrom.length === 1 ?
            "Sign with requested key" :
            "Sign with requested keys (" + requestedKeys.length + "/" + requestFrom.length + ")"

        button.setAttribute("requestedKeys", JSON.stringify(requestedKeys.map(k => k.keyId)))
        if(requestedKeys.find(k => AlgorithmNames.algorithmType(k.algorithm) === "ec") !== undefined)
            button.setAttribute("showRngSeed", "true") //show rng seed input iff a requested key is of type ec*
        if(requestedKeys.find(k => AlgorithmNames.algorithmType(k.algorithm) !== "ed"))
            button.setAttribute("showDmSelect", "true") //show dm select iff a requested key is not of type ed*

        return
    }

    //JSON sign request with accepted algorithms field or plain text 
    const legalAlgorithms = acceptedAlgorithms === undefined ?
        AlgorithmNames.supportedAlgorithms() :
        acceptedAlgorithms.map(AlgorithmNames.canonicalAlgorithmName).filter(x => x !== undefined)
    const legalKeys = keyDatabase.getKeyPairs().
        filter(k => legalAlgorithms.includes(AlgorithmNames.canonicalAlgorithmName(k.algorithm)))

    if(legalKeys.length === 0) {
        if(acceptedAlgorithms === undefined) {
            sel.innerHTML = "<option value=''>No key pairs exist, generate or add one first</option>"
        } else {
            sel.innerHTML = "<option value=''>No key pair with algorithm accepted by JSON sign request exist</option>"
            $("#signErrNoAcceptedKey").show()
        }
    } else {
        const f = (k1, k2) => k1.alias.localeCompare(k2.alias)
        legalKeys.sort(f)
        sel.innerHTML = legalKeys.map((k) => "<option value='" + k.keyId + "'>" + GUI.sanitize(k.alias) + "</option>")
        //keep last selected key if possible, otherwise choose first one
        if(lastSelectedKeyId !== "" && legalKeys.map(k => k.keyId).includes(lastSelectedKeyId)) {
            GUI.signSelectKey(lastSelectedKeyId)
        } else {
            GUI.signSelectKey(legalKeys[0].keyId)
        }
    }
}

//populate digest method select with legal (= accepted & supported) digest methods & select default one 
GUI.signPopulateDigestMethod = function (acceptedDigestMethods) {
    const sel = $("#signDigestMethod")[0]
    const legalDm = acceptedDigestMethods === undefined ?
        AlgorithmNames.supportedDigestMethods() :
        AlgorithmNames.supportedDigestMethods().filter(x =>
            acceptedDigestMethods.map(AlgorithmNames.canonicalDigestMethodName).includes(x))
    legalDm.sort()

    //return if options have not changed
    const lastAcceptedDigestMethods = [...sel.options].map(x => x.value).sort()
    if(JSON.stringify(lastAcceptedDigestMethods) === JSON.stringify(legalDm)) {
        return
    }

    if(legalDm.length === 0) {
        sel.innerHTML = "<option value=''>No supported digest method is accepted</option>"
        return
    }

    const defaultDm = legalDm.includes("sha256") ? "sha256" : legalDm[0]
    sel.innerHTML = legalDm.map((x) =>
        x === defaultDm ? "<option selected>" + x + "</option>" : "<option>" + x + "</option>"
    ).join(" ")
}

//show/hide digest method select based on selected key & setting
GUI.signDigestMethodSelect = function (keyDatabase) {
    if(!Settings.getBoolSetting("settingsChooseDigest")) {
        //disabled in settings => hide
        $("#signDigestMethod").parent().hide()
        return
    }

    //a requested key supports digest method selection => show
    if($("#signButton")[0].hasAttribute("showDmSelect")) {
        $("#signDigestMethod").parent().show()
        return
    }

    //no key selected => hide
    const keyId = $("#signSigningKey")[0].value
    if(keyId === "") {
        $("#signDigestMethod").parent().hide()
        return
    }

    //show/hide based on key type (only ec* & rsa*-keys)
    const alg = keyDatabase.getKeyById(keyId).algorithm
    if(AlgorithmNames.algorithmType(alg) !== "ed") {
        $("#signDigestMethod").parent().show()
    } else {
        $("#signDigestMethod").parent().hide()
    }

}

//show/hide custom RNG seed material based on selected key & setting
GUI.signCustomRngSeed = function (keyDatabase) {
    if(!Settings.getBoolSetting("settingsCustomRngSeedMaterial")) {
        //disabled in settings => hide
        $("#signRngSeed").parent().hide()
        return
    }

    //a requested key supports custom RNG seed material => show
    if($("#signButton")[0].hasAttribute("showRngSeed")) {
        $("#signRngSeed").parent().show()
        return
    }

    //no key selected => hide
    const keyId = $("#signSigningKey")[0].value
    if(keyId === "") {
        $("#signRngSeed").parent().hide()
        return
    }

    //show/hide based on key type (only ec*-keys support random source)
    const alg = keyDatabase.getKeyById(keyId).algorithm
    if(AlgorithmNames.algorithmType(alg) !== "ec") {
        $("#signRngSeed").parent().hide()
    } else {
        $("#signRngSeed").parent().show()
    }
}