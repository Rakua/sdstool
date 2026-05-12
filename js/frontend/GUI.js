class GUI {
    static async init(sdsTool) {
        GUI.initWarnBeforeLeaving()
        $("#settingsUseDarkTheme")[0].addEventListener("change", GUI.setTheme)

        try {
            //In Chromium running "openssl version" on WasmWebTerm throws an error
            //sometimes. Try reloading the page in that case and wait 1 second before 
            //executing the first command. Order of execution problem?
            if(sessionStorage.getItem("GUI/cleanRefresh") !== null) {
                const rt = parseInt(localStorage.getItem("GUI/reloadTimeout"))
                const timeout = isNaN(rt) || rt < 1 ? 1000 : rt
                await new Promise(r => setTimeout(r, timeout))
            }

            await GUI.initConsole(sdsTool)

            GUI.initDatabase(sdsTool)
            GUI.initKeys(sdsTool)
            GUI.initSign(sdsTool)
            GUI.initVerify(sdsTool)

            //GUI.initTabs() //call later (in main.js) to get right column spacing for db tables
            GUI.initDetails()
            GUI.clearOutputs()
            GUI.initShortcuts()

            GUI.initRequest()
        } catch(e) {
            //Opening SDSTool in a second tab in Chromium breaks the UI.
            //Cleaning the sessionStorage and reloading the page fixes it.    
            if(sessionStorage.getItem("GUI/cleanRefresh") !== null) {
                //already refreshed, something didn't work
                console.error(e)
                $("#failedToLoadOverlay").show()
            } else {
                GUI.cleanRefresh()
            }
        }
    }

    static cleanRefresh() {
        sessionStorage.clear()
        sessionStorage.setItem("GUI/cleanRefresh", "true")
        location.reload()
    }

    static initShortcuts() {
        document.addEventListener('keydown', async function (e) {
            if(e.altKey && e.key === "c") {
                //toggle console on Alt + C
                GUI.toggleConsole()
            } else if(e.altKey && e.key === "r") {
                //clear outputs on Alt + R
                GUI.clearOutputs()
            } else if(e.altKey && e.key === "w") {
                //toggle word wrap on Alt + W
                $("#signData")[0].classList.toggle("noLineWrap")
                $("#verifyData")[0].classList.toggle("noLineWrap")
                $("#signDataWrap")[0].checked = !$("#signData")[0].classList.contains("noLineWrap")
                $("#verifyDataWrap")[0].checked = !$("#verifyData")[0].classList.contains("noLineWrap")
            } else if(e.altKey && e.key === "p") {
                //open pw dialog on Alt + P                
                $("#dbSetPasswordButton")[0].dispatchEvent(new Event("click", { "view": window, "bubbles": true }))
            } else if(e.altKey && e.key === "g") {
                //generate 1k key on Alt + G
                if(GUI.activeTab("actionNavi") === "keys"
                    && GUI.activeTab("keysNavi") === "generateKey") {
                    $("#generateKeyPairButton")[0].disabled = true
                    for(let i = 0; i < 1000; i++) {
                        const algorithm = $("#generateAlgorithm")[0].value
                        const rngSeed = $('#generateKeyRngSeed')[0].value
                        await sdsTool.generateKeyPair(algorithm, undefined, rngSeed)
                    }
                    $("#generateKeyPairButton")[0].disabled = false
                }
            } else if(e.key === 'Enter' && $("#passwordOverlay")[0].style.display !== 'none') {
                //confirm password prompt with enter
                $("#passwordPromptOk")[0].dispatchEvent(new Event("click", { "view": window, "bubbles": true }))
            } else if(e.key === 'Escape' && $("#passwordOverlay")[0].style.display !== 'none') {
                //cancel password prompt with escape
                $("#passwordPromptCancel")[0].dispatchEvent(new Event("click", { "view": window, "bubbles": true }))
            }
        })
    }

    /* action output functions */
    static clearOutputs() {
        ["generateKey", "addKey", "sign", "verify", "database"].map(GUI.clearOutput)
    }

    static clearAllExceptSign() {
        ["generateKey", "addKey", "verify", "database"].map(GUI.clearOutput)
    }

    static clearOutput(name) {
        const el = $("#" + name + " > .output")
        el[0].innerHTML = '<div class="clearOutput"><a onClick="GUI.clearOutput(\'' + name + '\')">✖️</a></div>'
        el.hide()
    }

    static printOutput(name, content, outputClass) {
        const el = $("#" + name + " > .output")
        if(outputClass === undefined) {
            el[0].innerHTML += content
        } else {
            el[0].innerHTML += '<div class="' + outputClass + '">' + content + '</div>'
        }

        el.show()
    }

    static printOutputError(name, content) {
        content = '<span class="emoji">❌</span> ' + content
        GUI.printOutput(name, content.replaceAll("\n", "<br>\n"), "outputMessage")
    }

    static printOutputWarning(name, content) {
        content = '<span class="emoji">⚠️</span> ' + content
        GUI.printOutput(name, content.replaceAll("\n", "<br>\n"), "outputMessage")
    }

    static printOutputSuccess(name, content) {
        content = '<span class="emoji">✅</span> ' + content
        GUI.printOutput(name, content.replaceAll("\n", "<br>\n"), "outputMessage")
    }

    static printOutputInfo(name, content) {
        content = '<span class="emoji">ℹ️</span> ' + content
        GUI.printOutput(name, content.replaceAll("\n", "<br>\n"), "outputMessage")
    }

    /* tab functions */

    static initTabs() {
        for(const tabsEl of $(".tabs")) {
            const defaultOpenTabs = new Map()
            defaultOpenTabs.set("dbNavi", "yourKeys")
            defaultOpenTabs.set("actionNavi", "keys")
            defaultOpenTabs.set("keysNavi", "generateKey")

            //restore previously open tab if it exists, otherwise open default
            const x = sessionStorage.getItem("gui/tabs/" + tabsEl.id)
            const activeName = x !== null ? x : defaultOpenTabs.get(tabsEl.id)

            //display active tabs and add event listerns
            const naviType = GUI.isSubtabs(tabsEl.id) ? "a" : "button"
            for(const buttonEl of $("#" + tabsEl.id + " > " + naviType)) {
                if(buttonEl.name === activeName) {
                    buttonEl.classList.add("active")
                    $("#" + buttonEl.name)[0].style.display = "block"
                } else {
                    buttonEl.classList.remove("active")
                    $("#" + buttonEl.name)[0].style.display = "none"
                }
                buttonEl.addEventListener("click", (ev) => { GUI.openTab(tabsEl.id, buttonEl.name) })
            }
        }
    }

    static isSubtabs(tabsId) {
        return $("#" + tabsId)[0].classList.contains("subtabs")
    }

    static openTab(tabsId, tabName) {
        const naviType = GUI.isSubtabs(tabsId) ? "a" : "button"

        //iterate over all tab buttons/links 
        for(const buttonEl of $("#" + tabsId + " > " + naviType)) {
            if(buttonEl.name === tabName) {
                buttonEl.classList.add("active")
                $("#" + buttonEl.name)[0].style.display = "block"
            } else {
                buttonEl.classList.remove("active")
                $("#" + buttonEl.name)[0].style.display = "none"
            }
        }

        //remember last opened tab
        sessionStorage.setItem("gui/tabs/" + tabsId, tabName)

        if(GUI.getSignRequest() !== undefined) {
            GUI.clearAllExceptSign()
        } else {
            GUI.clearOutputs()
        }
    }

    static activeTab(tabsId) {
        const naviType = GUI.isSubtabs(tabsId) ? "a" : "button"
        return $("#" + tabsId + " > " + naviType).toArray()
            .find((x) => x.classList.contains("active"))
            .name
    }


    /* details related functions (for Help section) */

    static initDetails() {
        //check for setting whether close others is activated
        for(const el of $("#help > details > summary")) {
            el.addEventListener("click", GUI.closeOtherDetails)
        }
    }

    static closeOtherDetails(ev) {
        const srcEl = ev.srcElement
        for(const el of $("#help > details > summary")) {
            if(el.innerHTML !== srcEl.innerHTML) {
                el.parentNode.removeAttribute("open")
            }
        }
    }


    /* sign / verify request related functions  */
    static async initRequest() {
        const ru = Settings.getStringSetting("settingsRedirectUrl")
        try {
            const req = await getRequest()
            if(req === undefined) return //no request
            console.info("sign/verify request:", JSON.stringify(req))

            if(req.type == "sign") {
                if(ru == null || ru == "") {
                    //no redirect
                    GUI.signRequest(req)
                } else if(req.fromFragmentId === false) {
                    //forward sign request and send response back to opener, then close this window
                    GUI.blockingInfo(`Forwarding sign request from '${req.origin}' to '${ru}'. Please do not close this window.`)

                    const optionKeys = ["acceptedAlgorithms", "acceptedDigestMethods", "requirePublicKey", "requestSignaturesFrom", "contextId"]
                    const options = {}
                    optionKeys.forEach(k => { options[k] = req[k] })                    
                    const rootOrigin = SDSTSignRequest.rootOrigin(req)
                    const sr = new SDSTSignRequest(req.signData, options, ru, rootOrigin)
                    const resp = await sr.start()
                    window.opener.postMessage(resp, req.origin)
                    window.close()
                }
            } else if(req.type == "verify") {
                if(ru == null || ru == "") {
                    //no redirect
                    GUI.verifyRequest(req)
                } else if(req.fromFragmentId === false) {
                    //forward verify request and close this window
                    console.log("vr verifyData", req.verifyData)
                    const vr = new SDSTVerifyRequest(req.verifyData, ru)
                    await vr.start() //wait until verify request has been sent
                    window.close()
                }
            } else {
                throw new Error("Unkown request type " + JSON.stringify(req.type))
            }
        } catch(e) {
            console.error("Sign/verify request failed:", e)
            GUI.blockingInfo("Sign/verify request failed: " + e.message + "")
        }
    }

    static signRequest(req) {
        GUI.openTab("actionNavi", "sign")

        //validate and normalize sign request
        const signDataType = typeof req.signData
        if(signDataType != "string" && signDataType != "object")
            throw new Error("Field 'signData' must be of type string or object but got " + signDataType)

        if(req.acceptedAlgorithms !== undefined) {
            req.acceptedAlgorithms = AlgorithmNames.acceptedAlgorithms(req.acceptedAlgorithms)
            GUI.printOutputInfo("sign", "Accepted algorithm(s): " + req.acceptedAlgorithms.join(", "))
        }

        if(req.acceptedDigestMethods !== undefined) {
            req.acceptedDigestMethods = AlgorithmNames.acceptedDigestMethods(req.acceptedDigestMethods)
            GUI.printOutputInfo("sign", "Accepted digest method(s): " + req.acceptedDigestMethods.join(", "))
        }

        //hostname = null => no callback
        let hostname = null
        if(req.fromFragmentId === true) {
            if(typeof req.callback == "string") {
                try {
                    const url = new URL(req.callback)
                    if(url.protocol != "http:" && url.protocol != "https:")
                        throw new Error("Callback must begin with http(s) but got " + url.protocol)
                    hostname = url.hostname
                } catch(e) {
                    throw new Error("Could not extract hostname from callback: " + e.message)
                }
                req.hostname = hostname
            } //else no callback
        } else {
            delete req.callback
            try {
                hostname = new URL(req.origin).hostname
            } catch(e) {
                //this should not be possible since origin comes from a message event
                console.error("IMPOSSIBLE! Could not extract hostname from origin (" + req.origin + ")", e)
                throw new Error("IMPOSSIBLE! Could not extract hostname from origin (" + req.origin + "): " + e.message)
            }
        }
        if(req.noCallback !== true) req.hostname = hostname

        //attach serialized normalized request to #sign as attribute
        document.getElementById("sign").setAttribute("request", JSON.stringify(req))
        const sdEl = $("#signData")[0]
        sdEl.value = signDataType == "object"
            ? JSON.stringify(req.signData, undefined, 2)
            : req.signData
        sdEl.dispatchEvent(new Event("change", { "view": window, "bubbles": true }))
    }

    static verifyRequest(req) {
        GUI.openTab("actionNavi", "verify")

        if(typeof req.verifyData != "string" && typeof req.verifyData != "object")
            throw new Error("verifyData must be a string or an object")

        const vd = typeof req.verifyData == "object"
            ? JSON.stringify(req.verifyData, undefined, 2) : req.verifyData
        $("#verifyData")[0].value = vd
    }

    /* misc */
    static blockingInfo(msg) {
        document.getElementById("errorMessage").innerText = msg
        $("#errorOverlay").show()
    }

    static setTheme() {
        if(Settings.getBoolSetting("settingsUseDarkTheme")) {
            $("html")[0].dataset.theme = "dark"
            document.getElementById("logo").src = "img/logo-f1.svg"
        } else {
            $("html")[0].dataset.theme = "light"
            document.getElementById("logo").src = "img/logo-0e.svg"
        }

    }

    static dateToString(date, format) {
        if(date === undefined) return "N/A"
        switch(format) {
            case "locale": return date.toLocaleString()
            case "localeAlt": return dateToLocaleAltString(date)
            case "gmt": return date.toGMTString()
            case "iso": return date.toISOString()
            default: return date.toISOString()
        }
    }

    static autoFormatJson(elId) {
        try {
            if(Settings.getBoolSetting("settingsAutoFormatJson")) {
                const formatted = JSON.stringify(JSON.parse($(elId)[0].value), undefined, 2)
                $(elId)[0].value = formatted
            }
        } catch(e) {
            //do nothing
        }
    }

    static sanitize(userInput) {
        const escape = function (str) {
            const r = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#039;'
            }
            return str.replace(/[<>&"'\n]/g, function (m) { return r[m] })
        }
        return escape(userInput)
    }

    static initWarnBeforeLeaving() {
        const warnBeforeLeaving = (ev) => {
            const dontAskBeforeClosing = $("#sign")[0].hasAttribute("dontAskBeforeClosing")
            if(Settings.getBoolSetting("settingsWarnBeforeLeaving") && !dontAskBeforeClosing) {
                ev.preventDefault()
            }
        }
        addEventListener("beforeunload", warnBeforeLeaving)
    }

    static dontAskBeforeClosing() {
        $("#sign")[0].setAttribute("dontAskBeforeClosing", "true")
    }
}