GUI.initConsole = async function (sdsTool) {
    $("#sdstVersion")[0].innerText = sdstVersion

    $("#consoleClear")[0].addEventListener("click", GUI.clearConsole)
    $("#consoleHide")[0].addEventListener("click", GUI.toggleConsole)
    $("#settingsShowConsole")[0].addEventListener("change", (ev) => {
        if(Settings.getBoolSetting("settingsShowConsole")) {
            GUI.showConsole()
        } else {
            GUI.hideConsole()
        }
    })

    let sessionConsoleContent = null
    //let sessionConsoleContent = sessionStorage.getItem("gui/consoleContent")
    if(sessionConsoleContent === null) {
        //get openssl version and check webworker
        let opensslVersion = await sdsTool.wasmWrapper.run("openssl version")
        GUI.consolePrint(opensslVersion, true)
        if(sdsTool.wasmWrapper.usesWebWorker()) {
            GUI.consolePrint("WebWorker available (good)\n", true)
        } else {
            GUI.consolePrint("WebWorker unavailable (UI freezes during computation)\n", true)
        }
    } else {
        //restore console content
        $("#consoleOut")[0].innerHTML = sessionConsoleContent
    }

    sdsTool.wasmWrapper.printCmd = GUI.consolePrintCmd
    sdsTool.wasmWrapper.printStdout = (out) => {
        if(out.trim() !== "") GUI.consolePrint(out, true)
    }
    sdsTool.wasmWrapper.printStderr = (out) => {
        if(out.trim() !== "") GUI.consolePrintErr(out)
    }
}

GUI.toggleConsole = function () {
    const console = $("#console")[0]
    const layout = $("#layout")[0]
    if(GUI.isConsoleOpen()) {
        //hide console
        console.style.display = "none"
        layout.className = layout.className.replace("layout", "layoutWoConsole")
    } else {
        //show console
        console.style.display = "block"
        layout.className = layout.className.replace("layoutWoConsole", "layout")
        $("#console")[0].scrollTop = $("#console")[0].scrollHeight
    }
}

GUI.showConsole = function () {
    if(!GUI.isConsoleOpen()) GUI.toggleConsole()
}

GUI.hideConsole = function () {
    if(GUI.isConsoleOpen()) GUI.toggleConsole()
}

GUI.clearConsole = function () {
    $("#consoleOut")[0].innerHTML = "";
    sessionStorage.setItem("gui/consoleContent", "")
}

GUI.isConsoleOpen = function () {
    for(const className of $("#layout")[0].classList) {
        if(className.endsWith("WoConsole")) return false
    }
    return true
}

/* Printing */
GUI.consolePrintErr = function (str) {
    GUI.consolePrint("[ERR] " + str + "\n", true, "consoleError")
}

GUI.consolePrintWarn = function (str) {
    GUI.consolePrint("[WARN] " + str + "\n", true, "consoleWarning")
}

GUI.consolePrintCmd = function (cmd) {
    GUI.consolePrint("$ " + cmd, true, "consoleCmd")
}

GUI.consolePrint = function (str, newLine, outputClass) {
    const escape = function (str) {
        const r = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#039;',
            "\n": "<br>\n"
        }
        return str.replace(/[<>&"'\n]/g, function (m) { return r[m] })
    }
    const nl = newLine ? "<br>\n" : ""
    const cl = outputClass === undefined ? "" : ' class="' + outputClass + '"'
    $("#consoleOut")[0].innerHTML += "<span" + cl + ">" + escape(str) + "</span>" + nl
    $("#console")[0].scrollTop = $("#console")[0].scrollHeight
    //sessionStorage.setItem("gui/consoleContent", consoleOut.innerHTML)
}