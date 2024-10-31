//cast string, array of bytes or Uint8Array to Uint8Array
//returns undefined if bytes is not an array, string or Uint8Array
function castToUint8Array(bytes) {
    if(Array.isArray(bytes)) {
        //values outside [0.255] are taken modulo 256
        return new Uint8Array(bytes)
    } else if(bytes instanceof Uint8Array) {
        return bytes
    } else if(typeof bytes === "string") {
        return stringToUtf8Bytes(bytes)
    } else {
        return undefined
    }
}

function concatUint8Arrays(uint8Arr1, uint8Arr2) {
    let res = new Uint8Array(uint8Arr1.length + uint8Arr2.length)
    res.set(uint8Arr1)
    res.set(uint8Arr2, uint8Arr1.length)
    return res
}

async function sha512(bytes) {
    const uint8Array = castToUint8Array(bytes)
    const hashBuffer = await crypto.subtle.digest("SHA-512", uint8Array)
    return new Uint8Array(hashBuffer)
}

async function sha256(bytes) {
    const uint8Array = castToUint8Array(bytes)
    const hashBuffer = await crypto.subtle.digest("SHA-256", uint8Array)
    return new Uint8Array(hashBuffer)
}

//convert standard base64 variant to url-safe one
function base64UrlSafe(base64String) {
    return base64String.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

//convert url-safe base64 variant to standard one
function base64Standard(urlSafeBase64String) {
    let x = urlSafeBase64String.replace(/\-/g, '+').replace(/_/g, '/')
    if(x.length % 4 == 2) {
        x += "=="
    } else if(x.length % 4 == 3) {
        x += "="
    }
    return x
}

//converts standard base64 and url-safe variant to bytes
//returns undefined if base64String is invalid
function base64ToBytes(base64String) {
    let x = base64Standard(base64String)
    try {
        const binString = atob(x)
        return Uint8Array.from(binString, (m) => m.codePointAt(0))
    } catch(e) {
        //invalid base64String
        return undefined
    }
}

function base64FromBytes(bytes) {
    bytes = castToUint8Array(bytes)
    const binString = String.fromCodePoint(...bytes)
    return btoa(binString)
}

function stringToUtf8Bytes(str) {
    return (new TextEncoder()).encode(str)
}

//returns undefined if bytes are not a valid utf8 sequence
function stringFromUtf8Bytes(bytes) {
    let uint8Arr = castToUint8Array(bytes)
    try {
        return (new TextDecoder("utf-8", { "fatal": true })).decode(uint8Arr)
    } catch(e) {
        return undefined
    }
}

//e.g. isTypedArray("string",x) === true iff x is an array that only contains string elements
function isTypedArray(type, x) {
    if(!Array.isArray(x)) return false
    return x.map(x => typeof x).filter(x => x !== type).length === 0
}

function dateToLocaleAltString(date) {
    const x = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    const y = x.toISOString()
    return y.replace("T", " ").slice(0, y.lastIndexOf("."))
}

function validDateOrUndefined(x) {
    if(typeof x === "string") {
        const d = new Date(x)
        return isNaN(d.valueOf()) ? undefined : d
    } else if(x instanceof Date) {
        return isNaN(x.valueOf()) ? undefined : x
    } else {
        return undefined
    }
}

//inserts y into x after every n characters (except at the end)
//e.g. insertAfterEveryNChars("FFAA33",":",2) = "FF:AA:33"
function insertAfterEveryNChars(x, y, n) {
    let res = ""
    while(x !== "") {
        res += x.slice(0, n) + (x.length > n ? y : "")
        x = x.slice(n)
    }
    return res
}

//shrinks consecutive whitespaces to single ones and removes leading and trailing whitespaces in every line
function normalizePlainText(str) {
    return str.split("\n").map(x => x.trim().replace(/\s+/g, " ")).join("\n")
}

//should adhere to RFC 8785
function canonicalJsonStringify(obj) {
    const sortObjectPropertiesRecursively = function (obj) {
        if(typeof obj !== "object" || obj === null) return obj
        if(obj.toJSON !== undefined) return sortObjectPropertiesRecursively(obj.toJSON())
        if(Array.isArray(obj)) return obj.map(sortObjectPropertiesRecursively)

        return Object.keys(obj).sort().reduce(function (res, key) {
            res[key] = sortObjectPropertiesRecursively(obj[key])
            return res
        }, {})
    }

    return JSON.stringify(sortObjectPropertiesRecursively(obj))
}

function toHexString(bytes) {
    return Array.from(bytes, byte => ('0' + byte.toString(16)).slice(-2)).join('')
}

async function ciHash(ci) {
    return toHexString(await sha256(canonicalJsonStringify(ci)))
}