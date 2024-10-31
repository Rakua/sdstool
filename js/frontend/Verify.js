GUI.initVerify = function (sdsTool) {
    $("#verifyData")[0].addEventListener("change", (ev) => GUI.autoFormatJson("#verifyData"))
    //$("#verifyData")[0].addEventListener("change", (ev) => GUI.verifyUpdateUi(sdsTool))

    $("#settingsShowAdvancedOptions")[0].addEventListener("change", ev => {        
        if(Settings.getBoolSetting("settingsShowAdvancedOptions")) {
            $("#verifyAdvancedOptions").show()
        } else {
            $("#verifyAdvancedOptions").hide()
        }
    })      

    $("#verifyButton")[0].addEventListener("click", (ev) => {
        const data = $("#verifyData")[0].value
        const showJsonResult = $("#verifyShowJsonResult")[0].checked
        GUI.verify(sdsTool, $("#verifyData")[0].value, showJsonResult)
    })
}

GUI.verify = async function (sdsTool, data, showJsonResult) {
    const generateTable = function (signatures) {
        return signatures.map(x => {
            const inDatabase = x.key !== undefined && x.key.alias !== undefined
            let status = x.failedToVerify !== undefined ? x.failedToVerify : (x.valid ? "valid" : "invalid")
            let className = x.failedToVerify !== undefined ? "unverifiable" : (x.valid ? "valid" : "invalid")
            if(x.failedToVerify === undefined) {
                if(x.illegalAlgorithm === true) status += ", illegal algorithm"
                if(x.illegalDigestMethod === true) status += ", illegal digest method"
                if(className == "valid" && (x.illegalAlgorithm === true || x.illegalDigestMethod === true)) className = "illegal"
            }
            
            return {
                "name": inDatabase ? x.key.alias :
                    (x.publicKey !== undefined ? x.publicKey : x.keyId),
                "class": className,
                "status": status,
                "foreignPublicKey": x.publicKey !== undefined && !inDatabase ?
                    x.publicKey : undefined,
                "algorithm": x.key?.algorithm,
                "inDatabase": inDatabase,
                "keyId": x.key?.keyId,
                "noName": typeof x.keyId !== "string" && typeof x.publicKey !== "string",
                "illegalAlgorithm": x.illegalAlgorithm,
                "illegalDigestMethod": x.illegalDigestMethod,
                "isYou": inDatabase && KeyDatabase.isKeyPair(sdsTool.keyDatabase.getKeyById(x.key.keyId))
            }
        })
    }

    GUI.clearOutput("verify")

    try {
        const obj = JSON.parse(data)
        try {
            //verify JSON sign request
            const sr = SDSTool.validateJsonSignRequest(obj, true)
            let res = await sdsTool.verifyJsonSignRequest(sr)

            if(showJsonResult === true) $("#verifyData")[0].value = JSON.stringify(res, undefined, 2)

            GUI.verifyOutputTable(generateTable(res.signatures))

            if(Array.isArray(res.missingSignatures)) {
                if(res.missingSignatures.length == 0) {
                    GUI.printOutputSuccess("verify", "All requested signatures are present and valid")
                } else {
                    const n = res.requestSignaturesFrom.length
                    const m = n - res.missingSignatures.length
                    GUI.printOutputWarning("verify", m + "/" + n + " requested signatures are present and valid")
                }
            }
        } catch(e) {
            if(e instanceof InvalidJsonSrError) {
                GUI.printOutputError("verify", "Invalid JSON sr: " + e.reason)
            } else {
                console.log("[ERR]", e)
                GUI.printOutputError("verify", "Unexpected error: " + e.message)
            }
        }
    } catch(e) {
        const notJsonReason = e.message
        try {
            //verify plain text
            const res = await sdsTool.verifyPlainText(data)

            if(showJsonResult === true) $("#verifyData")[0].value = JSON.stringify(res, undefined, 2)
            GUI.verifyOutputTable(generateTable(res.orderedSignatures.reverse()))
        } catch(e) {
            if(e instanceof InvalidPlainTextError) {
                //syntax error 
                GUI.printOutputError("verify", "Syntax error: " + e.reason)
            } else {
                //unknown error
                console.log("[ERR]", e)
                GUI.printOutputError("verify", "Unexpected error: " + e.message)
            }
        }
    }

}

GUI.verifyOutputTable = function (rows) {
    const rmnl = x => x.replaceAll("\n","")
    const abbrv = x => x.length < 44 ? x : x.slice(0, 20) + "…" + x.slice(-20)

    GUI.clearOutput("verify")
    let table = `<table class="verifyTable"><tr><th>Signer</th><th>Signature</th></tr>`
    for(const row of rows) {
        if(row.noName) row.name = "N/A"

        if(row.foreignPublicKey !== undefined) {
            table += '<tr class="' + row.class + '"><td><a href="#" title="' + row.name + '" onClick="GUI.addSignerKey(\'' + rmnl(row.foreignPublicKey) + '\');event.preventDefault()">' + abbrv(rmnl(row.name)) + ' ('+ row.algorithm +')</a><br>KeyId: '+ row.keyId +'</td><td>' + row.status + '</td></tr>'
        } else {
            if(row.inDatabase) {
                const youLabel = row.isYou ? " <i>(you)</i>" : ""
                table += '<tr class="' + row.class + '"><td><a href="#" onClick="GUI.viewSignerKey(\'' + row.keyId + '\');event.preventDefault()">' + GUI.sanitize(row.name) + '</a>' + youLabel + '</td><td>' + row.status + '</td></tr>'
            } else {
                table += '<tr class="' + row.class + '"><td><span title="' + row.name + '">' + abbrv(rmnl(row.name)) + '</span></td><td>' + row.status + '</td></tr>'
            }
        }
    }
    GUI.printOutput("verify", table + "</table>")
}

//go to Keys/Add with public key input set to publicKey
GUI.addSignerKey = function (publicKey) {
    $("#addKeyAlias")[0].value = ""
    $("#addKeyKey")[0].value = insertAfterEveryNChars(publicKey, "\n", 64)
    $("#addKeyButton")[0].disabled = false
    GUI.openTab("actionNavi", "keys")
    GUI.openTab("keysNavi", "addKey")
}

GUI.viewSignerKey = function (keyId) {
    //global reference to sdsTool...
    GUI.viewKey(sdsTool.keyDatabase, keyId)
    GUI.openTab("actionNavi", "keys")
    GUI.openTab("keysNavi", "viewKey")
}