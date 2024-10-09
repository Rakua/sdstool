class GUI {
    static async init(sdsTool) {
        GUI.initWarnBeforeLeaving()
        $("#settingsUseDarkTheme")[0].addEventListener("change", GUI.setTheme)

        try {
            //In Chromium running "openssl version" on WasmWebTerm throws an error
            //sometimes. Try reloading the page in that case and wait 1 second before 
            //executing the first command. Order of execution problem?
            if(sessionStorage.getItem("GUI/cleanRefresh") !== null) await new Promise(r => setTimeout(r, 1000));
            await GUI.initConsole(sdsTool)
        } catch(e) {
            //Opening SDSTool in a second tab in Chromium breaks the UI.
            //Cleaning the sessionStorage and reloading the page fixes it.    
            if(sessionStorage.getItem("GUI/cleanRefresh") !== null) {
                //already refreshed, something didn't work
                console.log("[ERR]", e)
                $("#failedToLoadOverlay").show()
            } else {
                GUI.cleanRefresh()
            }
        }
        GUI.initDatabase(sdsTool)
        GUI.initKeys(sdsTool)
        GUI.initSign(sdsTool)
        GUI.initVerify(sdsTool)

        //GUI.initTabs() //call later (in main.js) to get right column spacing for db tables
        GUI.initDetails()
        GUI.initOutput()
        GUI.initShortcuts()
    }

    static cleanRefresh() {
        sessionStorage.clear()
        sessionStorage.setItem("GUI/cleanRefresh", "true")
        location.reload()
    }

    static initShortcuts() {
        document.addEventListener('keydown', async function (e) {
            if(e.altKey && e.key === "q") {
                //toggle console on Alt + Q
                GUI.toggleConsole()
            } else if(e.altKey && e.key === "w") {
                //clear outputs on Alt + W
                GUI.initOutput()
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
            }
        })
    }

    /* action output functions */
    static initOutput() {
        ["generateKey", "addKey", "sign", "verify", "database"].map(GUI.clearOutput)
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


    /* hash redirect (sign #S / verify #V)  */
    static redirectArgument() {
        return window.location.hash.slice(2)
    }

    static hashRedirect() {
        const hashValue = window.location.hash
        const mode = hashValue.slice(1, 2) //S for sign or V for verify
        const arg = hashValue.slice(2)

        //check for redirect sign #S or verify #V
        if(mode == "S") {
            GUI.openTab("actionNavi", "sign")
            try {
                //json obj: callback, data (string or JSON sign request), acceptedAlgorithms, acceptedDigestMethods
                const signObj = JSON.parse(decodeURIComponent(arg))
                if(signObj.data === undefined) {
                    GUI.printOutputError("sign", "Field 'data' missing in sign redirect")
                    return
                }

                //if signData is not a string, convert to its JSON string representation
                const signData = (typeof signObj.data == "string") ? signObj.data : JSON.stringify(signObj.data, null, 2)
                const sdEl = $("#signData")[0]
                sdEl.value = signData

                //attach additional information as attributes to #signData and #signCopyButton
                //attributes are only applied for plain text (JSON sign request must use attributes)
                if(signObj.acceptedAlgorithms !== undefined) {
                    const algs = AlgorithmNames.acceptedAlgorithms(signObj.acceptedAlgorithms)
                    sdEl.setAttribute("acceptedAlgorithms", algs.join(";"))
                    GUI.printOutputInfo("sign", "Accepted algorithm(s): " + algs.join(", "))
                }
                if(signObj.acceptedDigestMethods !== undefined) {
                    const dms = AlgorithmNames.acceptedDigestMethods(signObj.acceptedDigestMethods)
                    sdEl.setAttribute("acceptedDigestMethods", dms.join(";"))
                    GUI.printOutputInfo("sign", "Accepted digest method(s): " + dms.join(", "))
                }
                if(signObj.callback !== undefined && typeof signObj.callback == "string") {
                    const match = signObj.callback.match(/https?:\/\/([^\/]+)\//)
                    const hostname = match ? match[1] : null;
                    if(hostname === null) throw new Error("could not extract hostname from callback")
                    const cbEl = $("#signCopyButton")[0]
                    cbEl.setAttribute("callback", signObj.callback)
                    cbEl.innerText = "Send to " + hostname
                }

                sdEl.dispatchEvent(new Event("change", { "view": window, "bubbles": true }))

            } catch(e) {
                GUI.openTab("actionNavi", "sign")
                if(e instanceof SyntaxError) {
                    GUI.printOutputError("sign", "Failed to decode data for sign redirect. JSON syntax error: " + e.message)
                } else {
                    GUI.printOutputError("sign", "Failed to decode data for sign redirect: " + e.message)
                }
            }
        } else if(mode == "V") {
            try {
                const text = decodeURIComponent(arg)
                $("#verifyData")[0].value = text
                GUI.openTab("actionNavi", "verify")
            } catch(e) {
                GUI.openTab("actionNavi", "verify")
                GUI.printOutputError("verify", "Failed to decode data for verify redirect")
            }
        }
    }


    /* misc */
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
        const preventDefault = ev => ev.preventDefault()
        const handler = function (ev) {
            if(Settings.getBoolSetting("settingsWarnBeforeLeaving")) {
                addEventListener("beforeunload", preventDefault)
            } else {
                removeEventListener("beforeunload", preventDefault)
            }
        }
        $("#settingsWarnBeforeLeaving")[0].addEventListener("change", handler)
        handler()
    }
}