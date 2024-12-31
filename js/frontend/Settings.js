class Settings {
    static init() {
        //append date format examples
        const curDate = new Date()
        for(const x of $("#settingsDateFormat > option")) {
            x.innerText += ": " + GUI.dateToString(curDate, x.value)
        }

        Settings.load(true)
        $("#resetSettings")[0].addEventListener("click", ev => Settings.reset())


    }

    static reset() {
        for(const x in Settings.default()) {
            localStorage.removeItem("settings/" + x)
        }
        Settings.load(false)
        Settings.settingsChanged()
    }

    static settingsChanged() {
        const ev = new Event("change")
        for(const x of $("#settingsSignWithKeyId, #settings .formCheckbox input, #settings .formInput input , #settings select")) {
            x.dispatchEvent(ev)
        }
    }

    static load(attachOnChangeListeners) {
        for(const x of $("#settingsSignWithKeyId, #settings .formCheckbox input")) {
            const customSetting = localStorage.getItem("settings/" + x.id)
            x.checked = customSetting === null ? Settings.default()[x.id] : JSON.parse(customSetting)
            if(attachOnChangeListeners) {
                x.addEventListener("change", ev => localStorage.setItem("settings/" + x.id, x.checked))
            }
        }

        for(const x of $("#settings .formInput input, #settings select")) {
            const customSetting = localStorage.getItem("settings/" + x.id)
            x.value = customSetting !== null ? customSetting : Settings.default()[x.id]
            if(attachOnChangeListeners) {
                x.addEventListener("change", ev => localStorage.setItem("settings/" + x.id, x.value))
            }
        }
    }

    static getBoolSetting(id) {
        const x = localStorage.getItem("settings/" + id)
        return x !== null ? x === "true" : this.default()[id]
    }

    static getIntSetting(id) {
        const x = localStorage.getItem("settings/" + id)
        return x !== null ? Number(x) : this.default()[id]
    }

    static getStringSetting(id) {
        const x = localStorage.getItem("settings/" + id)
        return x !== null ? x : this.default()[id]
    }

    static default(name) {
        return {
            "settingsShowConsole": false,
            "settingsShowAdvancedOptions": false,
            "settingsWarnBeforeDeletingKey": true,
            "settingsWarnBeforeLeaving": true,
            "settingsUseLocalStorage": true,
            "settingsClearRngSeedAfterUse": false,
            "settingsCustomRngSeedMaterial": false,
            "settingsAutoFormatJson": true,
            "settingsNormalizePlainText": false,
            "settingsAppendNewlinePlainText": false,
            "settingsKeyIdPrefixPlainText": false,
            "settingsSignWithKeyId": false,
            "settingsChooseDigest": false,
            "settingsAlwaysLoadLocalDb": true,
            "settingsUseShortEndingPhrase": false,
            "settingsBreakAfterEndingPhrase": false,
            "settingsUseAutoPassword": false,
            "settingsUseDarkTheme": false,
            "settingsDateFormat": "locale",
            "settingsEntriesPerPage": 10,
            "settingsRedirectUrl": ""
        }
    }
}