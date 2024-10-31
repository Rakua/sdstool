class SDSTool {

    constructor(wasmWrapper, keyDatabase) {
        if(!(wasmWrapper instanceof WasmWrapper)) throw new Error("wasmWrapper must be instance of WasmWrapper")
        if(keyDatabase !== undefined && !(keyDatabase instanceof KeyDatabase)) throw new Error("keyDatabase must be instance of KeyDatabase or undefined")

        this.wasmWrapper = wasmWrapper
        this.keyDatabase = keyDatabase === undefined ? new KeyDatabase() : keyDatabase
    }

    loadKeyDatabase(kdb) {
        kdb.listeners = this.keyDatabase.listeners
        this.keyDatabase = kdb
        this.keyDatabase.reload()
    }

    /* add keys (return newly added key) & validate key pair */

    async generateKeyPair(algorithm, alias, randomString) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()

        const alg = AlgorithmNames.canonicalAlgorithmName(algorithm)
        if(alg === undefined) throw new UnknownAlgorithmError(algorithm)
        await this.seedRng(randomString)

        //generate key pair
        switch(AlgorithmNames.algorithmType(alg)) {
            case 'rsa':
                const bits = alg.slice(3)
                await this.wasmWrapper.run("openssl genrsa -out private.pem -rand seed.dat $1".replace("$1", bits))
                await this.wasmWrapper.run("openssl rsa -pubout -in private.pem -outform PEM -out public.pem")
                break
            case 'ec':
                await this.wasmWrapper.run("openssl ecparam -genkey -name $1 -out private.pem -rand seed.dat".replace("$1", alg))
                await this.wasmWrapper.run("openssl ec -pubout -in private.pem -outform PEM -out public.pem")
                break
            case 'ed':
                await this.wasmWrapper.run("openssl genpkey -algorithm $1 -out private.pem -rand seed.dat".replace("$1", alg))
                await this.wasmWrapper.run("openssl pkey -in private.pem -pubout -out public.pem")
                break
        }

        try {
            //add key pair to database            
            const privKey = this.wasmWrapper.getFile("private.pem").bytes
            const pubKey = this.wasmWrapper.getFile("public.pem").bytes
            const keyId = await SDSTool.generateKeyId(pubKey)
            return this.keyDatabase.addKey(alias, keyId, alg, pubKey, privKey)
        } finally {
            this.wasmWrapper.removeFile("private.pem")
        }
    }

    async addPublicKey(publicKey, alias, addedOn, overwriteFlag) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()
        if(addedOn === undefined) addedOn = new Date()

        publicKey = SDSTool.normalizePublicKey(publicKey)
        const algorithm = await this.deriveAlgorithmFromKey(publicKey)
        if(algorithm === undefined) throw new UnknownAlgorithmError("failed to derive algorithm from public key")
        const keyId = await SDSTool.generateKeyId(publicKey)

        if(overwriteFlag === true) this.keyDatabase.deleteKey(keyId)
        return this.keyDatabase.addKey(alias, keyId, algorithm, publicKey, undefined, addedOn)
    }

    //privateKey must be in PEM format, publicKey is derived
    async addPrivateKey(privateKey, alias, addedOn, overwriteFlag) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()
        if(addedOn === undefined) addedOn = new Date()

        //derive public key from private key
        privateKey = privateKey.trim() + "\n" //ensure trailing \n
        this.wasmWrapper.writeFile("private.pem", castToUint8Array(privateKey))
        this.wasmWrapper.removeFile("public.pem")
        const alg = await this.deriveAlgorithmFromKey(privateKey)
        if(alg === undefined) throw new UnknownAlgorithmError("failed to derive algorithm from private key")
        switch(AlgorithmNames.algorithmType(alg)) {
            case 'rsa':
                const bits = alg.slice(3)
                await this.wasmWrapper.run("openssl rsa -pubout -in private.pem -outform PEM -out public.pem")
                break
            case 'ec':
                await this.wasmWrapper.run("openssl ec -pubout -in private.pem -outform PEM -out public.pem")
                break
            case 'ed':
                await this.wasmWrapper.run("openssl pkey -in private.pem -pubout -out public.pem")
                break
        }
        if(this.wasmWrapper.getFile("public.pem") === undefined) throw new InvalidPrivateKeyError(privateKey)
        const publicKey = stringFromUtf8Bytes(this.wasmWrapper.getFile("public.pem").bytes)
        this.wasmWrapper.removeFile("private.pem")
        const keyId = await SDSTool.generateKeyId(publicKey)

        const tmpKey = { "algorithm": alg, "privateKey": privateKey, "publicKey": publicKey }
        if(!await this.validateKeyPair(tmpKey)) throw new InvalidPrivateKeyError(privateKey)

        if(overwriteFlag === true) this.keyDatabase.deleteKey(keyId)
        return this.keyDatabase.addKey(alias, keyId, alg, publicKey, privateKey, addedOn)
    }

    //returns true iff public & private key fit together, i.e. sign & verify works
    async validateKeyPair(key) {
        if(!KeyDatabase.isKeyPair(key)) throw new NoPrivateKeyError(key.keyId)
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()

        const inputBytes1 = new Uint8Array(64)
        const inputBytes2 = new Uint8Array(64)
        crypto.getRandomValues(inputBytes1)
        crypto.getRandomValues(inputBytes2)

        let signatureBytes1 = await this.sign(key, inputBytes1)
        let signatureBytes2 = await this.sign(key, inputBytes2)

        let r11 = await this.verify(key, inputBytes1, signatureBytes1) //expected true
        let r12 = await this.verify(key, inputBytes1, signatureBytes2) //expected false
        let r21 = await this.verify(key, inputBytes2, signatureBytes1) //expected false
        let r22 = await this.verify(key, inputBytes2, signatureBytes2) //expected true        

        return r11 && r22 && !r12 && !r21
    }


    /* sign */

    async sign(key, inputBytes, digestMethod, randomString) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()
        if(inputBytes.length == 0) throw new EmptyDataSignError()

        this.wasmWrapper.writeFile("input.dat", castToUint8Array(inputBytes))
        this.wasmWrapper.writeFile("private.pem", castToUint8Array(key.privateKey))

        let dm = digestMethod === undefined ? SDSTool.defaultDigestMethod() : AlgorithmNames.canonicalDigestMethodName(digestMethod)
        if(dm === undefined) throw new UnknownDigestMethodError(digestMethod)

        switch(AlgorithmNames.algorithmType(key.algorithm)) {
            case 'rsa':
                await this.wasmWrapper.run("openssl dgst -$1 -sign private.pem -out signature.dat input.dat".replace("$1", dm))
                break
            case 'ec':
                await this.seedRng(randomString)
                await this.wasmWrapper.run("openssl dgst -$1 -rand seed.dat -sign private.pem -out signature.dat input.dat".replace("$1", dm))
                break
            case 'ed':
                await this.wasmWrapper.run("openssl pkeyutl -sign -inkey private.pem -out signature.dat -rawin -in input.dat")
                break
            default:
                throw new UnknownAlgorithmError(key.algorithm)
        }

        let res = this.wasmWrapper.getFile("signature.dat").bytes
        this.wasmWrapper.removeFile("private.pem")
        if(res.length === 0) throw new SignFailedError()
        return res
    }

    async signPlainText(key, inputText, endingPhrase, signWithKeyId, digestMethod, randomString, keyIdPrefixLength) {
        if(endingPhrase === undefined) endingPhrase = SDSTool.defaultEndingPhrases()[0]

        const lineBreakAfter64 = (x) => insertAfterEveryNChars(x, "\n", 64)
        const sigBytes = await this.sign(key, stringToUtf8Bytes(inputText), digestMethod, randomString)
        const sig = lineBreakAfter64(base64FromBytes(sigBytes))
        const sigName = signWithKeyId ?
            (keyIdPrefixLength === undefined ? key.keyId : key.keyId.slice(0, keyIdPrefixLength)) :
            lineBreakAfter64(SDSTool.publicKeyPemToRaw(key.publicKey))
        const sigDm =
            AlgorithmNames.algorithmType(key.algorithm) !== "ed" && digestMethod !== SDSTool.defaultDigestMethod() ?
                "\n\n" + digestMethod : ""
        return inputText + "\n" + endingPhrase + "\n" + sig + "\n\n" + sigName + sigDm
    }

    //jsr = SDSTool.jsonSignRequest(JSON.parse(userInput))
    async signJsonSignRequest(key, jsr, signWithKeyId, digestMethod, randomString) {
        const alg = key !== undefined ? AlgorithmNames.canonicalAlgorithmName(key.algorithm) : undefined
        const dm = digestMethod === undefined ? SDSTool.defaultDigestMethod() : AlgorithmNames.canonicalDigestMethodName(digestMethod)
        const acceptedDms = isTypedArray("string", jsr.acceptedDigestMethods) ?
            jsr.acceptedDigestMethods.map(AlgorithmNames.canonicalDigestMethodName).filter(x => x !== undefined) :
            [SDSTool.defaultDigestMethod()] //only accept sha256 if no accepted digest methods were specified

        if(isTypedArray("string", jsr.requestSignaturesFrom)) {
            //auto select keys for which signature is requested (ignore key parameter)
            let found = false
            for(const kid of jsr.requestSignaturesFrom) {
                const autoKey = this.keyDatabase.getKeyById(kid)
                if(autoKey !== undefined) {
                    found = true
                    if(!acceptedDms.includes(dm) && AlgorithmNames.algorithmType(autoKey.algorithm) !== "ed")
                        throw new JsonSrSignError(jsr, "Selected digest method '" + dm + "' not accepted for this JSON sign request")
                    jsr = await this.signJsonSignRequest_sign(autoKey, jsr, signWithKeyId, digestMethod, randomString)
                }
            }
            if(!found) throw new JsonSrSignError(jsr, "No key found from which a signature is requested")

            return jsr
        } else {
            //check dm (only if neither field acceptAllDigestMethods is present nor select key is of type ed*)
            if(jsr.acceptAllDigestMethods !== true && AlgorithmNames.algorithmType(key.algorithm) !== "ed") {
                if(!acceptedDms.includes(dm))
                    throw new JsonSrSignError(jsr, "Selected digest method '" + dm + "' not accepted for this JSON sign request")
            }

            //check that algorithm is accepted
            const acceptedAlgorithms = jsr.acceptedAlgorithms.map(AlgorithmNames.canonicalAlgorithmName).filter(x => x !== undefined)
            if(!acceptedAlgorithms.includes(alg))
                throw new JsonSrSignError(jsr, "Selected algorithm '" + alg + "' not accepted for this JSON sign request")

            return await this.signJsonSignRequest_sign(key, jsr, signWithKeyId, digestMethod, randomString)
        }
    }

    //helper function that returns signed jsr (does not check accepted algorithms & digest method)
    async signJsonSignRequest_sign(key, jsr, signWithKeyId, digestMethod, randomString) {
        const dm = digestMethod === undefined ?
            SDSTool.defaultDigestMethod() : AlgorithmNames.canonicalDigestMethodName(digestMethod)

        const inputBytes = typeof jsr.data === "string" ?
            stringToUtf8Bytes(jsr.data) : stringToUtf8Bytes(canonicalJsonStringify(jsr.data))
        const sig = base64FromBytes(await this.sign(key, inputBytes, digestMethod, randomString))

        if(Array.isArray(jsr.signatures)) {
            //remove previous signatures from same key            
            jsr.signatures = jsr.signatures.
                filter((x) => x.keyId !== key.keyId && x.publicKey !== SDSTool.publicKeyPemToRaw(key.publicKey))
        } else {
            //no signatures present, initialize 'signatures' field
            jsr.signatures = []
        }

        let sigObj = {}
        sigObj.signature = sig
        if(signWithKeyId && jsr.requirePublicKey !== true) {
            sigObj.keyId = key.keyId
        } else {
            sigObj.publicKey = SDSTool.publicKeyPemToRaw(key.publicKey)
        }
        if(AlgorithmNames.algorithmType(key.algorithm) !== "ed" && dm !== SDSTool.defaultDigestMethod()) {
            //add digest method since algorithm allows digest method selection (non-ed) and
            //dm is not the default digest method (sha256)
            sigObj.digestMethod = dm
        }
        jsr.signatures.push(sigObj)

        return jsr
    }


    /* verify */

    async verify(key, inputBytes, signatureBytes, digestMethod) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()

        const opensslValidSignatureMagicStrings = ["Verified OK\n", "Signature Verified Successfully\n"]

        this.wasmWrapper.writeFile("input.dat", castToUint8Array(inputBytes))
        this.wasmWrapper.writeFile("signature.dat", castToUint8Array(signatureBytes))
        this.wasmWrapper.writeFile("public.pem", castToUint8Array(key.publicKey))

        let dm = digestMethod === undefined ? SDSTool.defaultDigestMethod() : AlgorithmNames.normalizeAlgorithmName(digestMethod)

        switch(AlgorithmNames.algorithmType(key.algorithm)) {
            case 'rsa':
            case 'ec':
                if(dm === undefined) throw new UnknownDigestMethodError(dm)
                const cmdDgst = "openssl dgst -$1 -verify public.pem -out result.txt -signature signature.dat input.dat"
                await this.wasmWrapper.run(cmdDgst.replace("$1", dm))
                break
            case 'ed':
                //if(digestMethod !== undefined) throw new NoDigestExpectedForEdDSAError(digestMethod) //ignore
                const cmdPkeyutl = "openssl pkeyutl -verify -pubin -inkey public.pem -rawin -in input.dat -sigfile signature.dat -out result.txt"
                await this.wasmWrapper.run(cmdPkeyutl)
                break
        }

        let res = stringFromUtf8Bytes(this.wasmWrapper.getFile("result.txt").bytes)
        this.wasmWrapper.removeFile("public.pem")
        this.wasmWrapper.removeFile("input.dat")
        this.wasmWrapper.removeFile("signature.dat")
        //this.wasmWrapper.removeFile("result.txt")

        return opensslValidSignatureMagicStrings.includes(res)
        //return SDSTool.opensslValidSignature(res)
    }

    //returns jsr with results (jsr must be valid: jsr = validateJsonSignRequest(obj,true))
    async verifyJsonSignRequest(jsr) {
        const inputBytes = typeof jsr.data === "string" ?
            stringToUtf8Bytes(jsr.data) :
            stringToUtf8Bytes(canonicalJsonStringify(jsr.data))

        delete jsr.missingSignatures

        for(let x of jsr.signatures) {
            //delete old verify fields
            delete x.failedToVerify
            delete x.valid
            delete x.key
            delete x.illegalAlgorithm
            delete x.illegalDigestMethod

            try {
                const key = await this.deriveKeyFromKeyIdOrPublicKey(x)
                const alg = AlgorithmNames.canonicalAlgorithmName(key.algorithm)

                //remove private key since x might be shown to user (Show result as JSON)
                const keyCopy = JSON.parse(JSON.stringify(key))
                delete keyCopy.privateKey
                x.key = keyCopy

                const dm = x.digestMethod === undefined ?
                    SDSTool.defaultDigestMethod() :
                    AlgorithmNames.canonicalDigestMethodName(x.digestMethod)
                //if algorithm type is "ed", ignore digest method
                if(dm === undefined && AlgorithmNames.algorithmType(alg) != "ed") {
                    x.failedToVerify = "unknown digest method"
                    continue
                }

                if(x.signature === undefined) {
                    x.failedToVerify = "missing signature"
                    continue
                }
                if(typeof x.signature !== "string") {
                    x.failedToVerify = "signature not a string"
                    continue
                }
                const sigBytes = base64ToBytes(x.signature)
                if(sigBytes === undefined) {
                    x.failedToVerify = "signature not in base64"
                    continue
                }

                x.valid = await this.verify(key, inputBytes, sigBytes, dm)

                //check if signer used accepted algorithm
                if(jsr.acceptedAlgorithms !== undefined) {

                    if(!jsr.acceptedAlgorithms.map(AlgorithmNames.canonicalAlgorithmName).filter(x => x !== undefined).includes(alg)) {
                        x.illegalAlgorithm = true
                    }
                }

                //check if signer uses accepted digest method
                if(jsr.acceptAllDigestMethods !== true && AlgorithmNames.algorithmType(alg) !== "ed") {
                    const acceptedDMs = Array.isArray(jsr.acceptedDigestMethods) ?
                        jsr.acceptedDigestMethods.map(AlgorithmNames.canonicalDigestMethodName) :
                        [SDSTool.defaultDigestMethod()]
                    if(!acceptedDMs.includes(dm)) {
                        x.illegalDigestMethod = true
                    }
                }
            } catch(e) {
                if(e instanceof DeriveKeyError) {
                    x.failedToVerify = "failed to derive key (" + e.reason + ")"
                } else if(e instanceof WasmBusyError) {
                    x.failedToVerify = "Wasm busy, try again"
                } else {
                    x.failedToVerify = "unexpected error: " + e.message
                }
            }
        }

        //check if signatures are missing if requestSignaturesFrom is defined
        if(jsr.requestSignaturesFrom !== undefined) {
            jsr.missingSignatures = jsr.requestSignaturesFrom.filter(
                keyId => jsr.signatures.find(sigObj => sigObj.valid === true && sigObj.key.keyId === keyId) === undefined
            )
        }

        return jsr
    }

    //checks if obj is a valid JSON sign request. if so returns obj as is, else throws error    
    static validateJsonSignRequest(obj, validateForVerify) {
        if(obj.data === undefined) throw new InvalidJsonSrError(obj, "data missing")
        if(typeof obj.data !== "string" && typeof obj.data !== "object")
            throw new InvalidJsonSrError(obj, "data neither string nor object")

        //a JSON sr needs to have the field acceptedAlgorithms or requestSignaturesFrom unless it is for verification
        if(validateForVerify !== true && obj.acceptedAlgorithms === undefined && obj.requestSignaturesFrom === undefined)
            throw new InvalidJsonSrError(obj, "neither acceptedAlgorithms nor requestSignaturesFrom present")

        for(const x of ["requestSignaturesFrom", "acceptedAlgorithms", "acceptedDigestMethods"]) {
            if(obj[x] !== undefined) {
                if(!isTypedArray("string", obj[x])) throw new InvalidJsonSrError(obj, x + " is not an array of strings")
            }
        }

        if(validateForVerify) {
            //check that at least one signature is present
            if(obj.signatures === undefined) throw new InvalidJsonSrError(obj, "signatures missing")
            if(!Array.isArray(obj.signatures)) throw new InvalidJsonSrError(obj, "signatures not an array")
            if(obj.signatures.length == 0) throw new InvalidJsonSrError(obj, "signatures empty")
        }

        //valid jsr
        return obj
    }

    //verifies every signatures from bottom to top
    async verifyPlainText(text, endingPhrases) {
        let jsr1 = SDSTool.plainTextToJsonSignRequest(text, endingPhrases)
        jsr1 = await this.verifyJsonSignRequest(jsr1) //check bottom-most signature
        //contains all signatures ordered from bottom-most to top-most
        jsr1.orderedSignatures = [jsr1.signatures[0]]

        let jsr = { "data": jsr1.data }
        while(true) {
            try {
                jsr = SDSTool.plainTextToJsonSignRequest(jsr.data)
                jsr = await this.verifyJsonSignRequest(jsr)
                jsr1.orderedSignatures.push(jsr.signatures[0])
            } catch(e) {
                break
            }
        }

        return jsr1
    }

    //checks if text contains ending phrase and signature+name and converts it to JSON sr
    static plainTextToJsonSignRequest(text, endingPhrases) {
        if(endingPhrases === undefined) endingPhrases = SDSTool.defaultEndingPhrases()
        const tr = x => x.trim()
        const rnl = x => x.replaceAll("\n", "")

        let res = { "data": undefined, signatures: [], "acceptAllDigestMethods": true }
        const lines = text.split("\n")
        const splitAt = lines.findLastIndex(x => endingPhrases.map(tr).includes(tr(x)))
        if(splitAt === -1) throw new InvalidPlainTextError(text, "no ending phrase")
        const data = lines.slice(0, splitAt).join("\n")
        res.data = data

        const sig = lines.slice(splitAt + 1).map(tr).join("\n").split("\n\n").map(tr).filter(x => x !== "").map(rnl)
        if(sig.length < 2) throw new InvalidPlainTextError(text, "no name")
        let sigObj = { "signature": sig[0], "keyId": undefined, "publicKey": undefined, "digestMethod": undefined }
        if(sig[1].length === 43) {
            sigObj.keyId = sig[1]
        } else if(sig[1].length >= 12 && sig[1].length <= 14) {
            //KeyId prefix (between 12 and 14 characters)
            sigObj.keyId = sig[1]
        } else {
            sigObj.publicKey = rnl(sig[1])
        }
        if(sig.length > 2) {
            sigObj.digestMethod = sig[2]
        }

        res.signatures = [sigObj]
        return res
    }

    //obj has field keyId or publicKey; returns key or throws error
    async deriveKeyFromKeyIdOrPublicKey(obj) {
        if(obj.publicKey !== undefined) {
            const pubKey = SDSTool.normalizePublicKey(obj.publicKey)
            const key1 = this.keyDatabase.getKeyByPublicKey(pubKey)
            if(key1 !== undefined) return key1 //key found in datbase

            //create and return stub key for verification
            const key = {
                "keyId": await SDSTool.generateKeyId(pubKey),
                "publicKey": pubKey,
                "algorithm": await this.deriveAlgorithmFromKey(pubKey)
            }
            if(key.algorithm === undefined) throw new DeriveKeyError(obj, "invalid public key")
            return key
        } else if(obj.keyId !== undefined) {
            if(obj.keyId.length === 43) {
                const key = this.keyDatabase.getKeyById(obj.keyId)
                if(key === undefined) throw new DeriveKeyError(obj, "keyId not found")
                return key
            } else {
                //KeyId prefix (between 8 and 14)
                const keys = this.keyDatabase.getKeysByKeyIdPrefix(obj.keyId)
                if(keys.length === 0) throw new DeriveKeyError(obj, "keyId prefix not found")
                if(keys.length > 1) throw new DeriveKeyError(obj, "keyId prefix has multiple matches")
                return keys[0]
            }
        } else {
            throw new DeriveKeyError(obj, "no keyId or publicKey")
        }
    }


    /* encryption & decryption using aes-256-cbc */

    async encrypt(inputBytes, password, useBase64) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()

        const b64 = useBase64 === undefined ? " " : " -base64 -A "
        this.wasmWrapper.writeFile("input.dat", castToUint8Array(inputBytes))
        this.wasmWrapper.writeFile("pass.dat", castToUint8Array(password))
        const encryptCmd =
            "openssl enc -aes-256-cbc -md sha256" + b64 + "-pbkdf2 -iter 10000 -pass file:pass.dat -in input.dat -out input.enc"

        try {
            await this.wasmWrapper.run(encryptCmd)
            return this.wasmWrapper.getFile("input.enc").bytes
        } catch(e) {
            console.log("[ERR]", e)
            GUI.consolePrintErr("Failed to encrypt because:\n" + e.message)
        } finally {
            this.wasmWrapper.removeFile("pass.dat")
        }
    }

    //returns Uint8Array on success and undefined on bad password or wrong base64 mode
    async decrypt(inputBytes, password, useBase64) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()

        const b64 = useBase64 === undefined ? " " : " -base64 -A "
        this.wasmWrapper.writeFile("input.dat", castToUint8Array(inputBytes))
        this.wasmWrapper.writeFile("pass.dat", castToUint8Array(password))
        const decryptCmd =
            "openssl enc -d -aes-256-cbc -md sha256" + b64 + "-pbkdf2 -iter 10000 -pass file:pass.dat -in input.dat -out input.dec"

        try {
            const output = await this.wasmWrapper.run(decryptCmd)
            const res = this.wasmWrapper.getFile("input.dec").bytes
            return output.startsWith("bad") ? undefined : res
        } catch(e) {
            console.log("[ERR]", e)
            GUI.consolePrintErr("Failed to decrypt because:\n" + e.message)
        } finally {
            this.wasmWrapper.removeFile("pass.dat")
        }
    }

    async encryptKeyDatabase(password) {
        return (password === undefined || password === null) ?
            this.keyDatabase.toJson() :
            "ENCRYPTED " + stringFromUtf8Bytes(await this.encrypt(this.keyDatabase.toJson(), password, true))
    }

    //returns KeyDatabase instance (also works for unencrypted kdbString)
    async decryptKeyDatabase(kdbString, password) {
        if(!SDSTool.isEncryptedKeyDatabase(kdbString)) return KeyDatabase.fromJson(kdbString)
        const x = await this.decrypt(kdbString.slice("ENCRYPTED ".length), password, true)
        if(x === undefined) throw new WrongDbPasswordError()
        kdbString = stringFromUtf8Bytes(x)
        return KeyDatabase.fromJson(kdbString)
    }

    static isEncryptedKeyDatabase(kdbString) {
        return kdbString.startsWith("ENCRYPTED ")
    }

    /* misc */

    //provides rng seed for openssl via -rand parameter
    async seedRng(inputString) {
        const uaSeed = new Uint8Array(64)
        crypto.getRandomValues(uaSeed)
        if(inputString === undefined) {
            //no user input, use random values from Web Crypto API            
            this.wasmWrapper.writeFile("seed.dat", uaSeed)
        } else {
            //concat user input and random values from Web Crypto API
            if(typeof inputString !== "string") throw new SeedRngError()
            this.wasmWrapper.writeFile("seed.dat", concatUint8Arrays(stringToUtf8Bytes(inputString), uaSeed))
        }
    }

    //returns algorithm for private or public key in PEM format & undefined if key is invalid
    async deriveAlgorithmFromKey(key) {
        if(this.wasmWrapper.isBusy()) throw new WasmBusyError()
        if(key === undefined) throw new ReferenceError("Parameter key is undefined")
        key = castToUint8Array(key)

        this.wasmWrapper.writeFile("key.pem", key)
        const keyInfo = (await this.wasmWrapper.run("openssl asn1parse -in key.pem", true)).toLowerCase()

        if(keyInfo.includes(":rsaencryption")) {
            //determine modulos from key size of public / private key            
            const rsaModSizes = [1024, 1536, 2048, 3072, 4096, 7680, 8192, 15360, 16384]
            const rsaPublicSizes = [272, 361, 451, 625, 800, 1405, 1491, 2705, 2880]
            const rsaPrivateSizes = [916, 1306, 1704, 2484, 3272, 6002, 6392, 11852, 12632]

            const len = this.wasmWrapper.getFile("key.pem").bytes.length
            const isPublicKey = stringFromUtf8Bytes(key).startsWith("-----BEGIN PUBLIC KEY-----")
            const modulos = isPublicKey ?
                rsaModSizes[rsaPublicSizes.findIndex(x => x === len || x === len - 1)] :
                rsaModSizes[rsaPrivateSizes.findIndex(x => x === len || x === len - 1)]

            this.wasmWrapper.removeFile("key.pem")
            return modulos === undefined ? undefined : "rsa" + modulos
        } else {
            this.wasmWrapper.removeFile("key.pem")
            return AlgorithmNames.supportedAlgorithms().find((x) => keyInfo.includes(":" + x.toLowerCase()))
        }
    }

    //loads public key & private key (if it exists) into wasm fs
    loadKey(key) {
        if(KeyDatabase.isKeyPair(key)) {
            this.wasmWrapper.writeFile("private.pem", castToUint8Array(key.privateKey))
            this.wasmWrapper.writeFile("public.pem", castToUint8Array(key.publicKey))
        } else {
            this.wasmWrapper.writeFile("public.pem", castToUint8Array(key.publicKey))
        }
    }

    clearFiles() {
        this.wasmWrapper.removeFile("private.pem")
        this.wasmWrapper.removeFile("public.pem")
        this.wasmWrapper.removeFile("seed.dat")
        this.wasmWrapper.removeFile("input.dat")
        this.wasmWrapper.removeFile("signature.dat")
        this.wasmWrapper.removeFile("pass.dat")
        this.wasmWrapper.removeFile("key.pem")
    }

    abortWasm() {
        return this.wasmWrapper.abort()
    }

    static defaultDigestMethod() {
        return "sha256"
    }

    static defaultEndingPhrases() {
        return ["-----SIGNATURE-----", "---SIG---"]
    }

    //sha256 hash of the DER bytes of the public key in url-safe base64
    static async generateKeyId(publicKey) {
        let rawPubKey = SDSTool.publicKeyPemToRaw(publicKey)
        return base64UrlSafe(base64FromBytes(await sha256(base64ToBytes(rawPubKey))))
        //return base64UrlSafe(base64FromBytes(await sha256(publicKey)))
    }


    /* public key PEM conversion functions  */

    //remover header, footer and line breaks
    static publicKeyPemToRaw(publicKeyPem) {
        const pk = stringFromUtf8Bytes(castToUint8Array(publicKeyPem))
        //return base64UrlSafe(pk.trim().split("\n").slice(1, -1).join(""))
        return pk.trim().split("\n").slice(1, -1).join("")
    }

    static publicKeyRawToPem(publicKey) {
        const lineBreakAfter64 = x => insertAfterEveryNChars(x, "\n", 64)
        publicKey = publicKey.replaceAll("\n", "")
        return "-----BEGIN PUBLIC KEY-----\n"
            + lineBreakAfter64(base64Standard(publicKey.trim()))
            + "\n-----END PUBLIC KEY-----\n"
    }

    static publicKeyIsPem(publicKey) {
        return publicKey.trim().startsWith("-----BEGIN PUBLIC KEY-----")
    }

    //returns publicKey in PEM format
    static normalizePublicKey(publicKey) {
        if(SDSTool.publicKeyIsPem(publicKey)) {
            return publicKey.trim() + "\n" //ensure trailing "\n"
        } else {
            return SDSTool.publicKeyRawToPem(publicKey)
        }
    }

}

class UnknownAlgorithmError extends Error {
    constructor(algorithm) {
        super("Algorithm unknown (" + algorithm + ")")
        this.name = 'UnknownAlgorithmError'
        this.algorithm = algorithm
    }
}

class UnknownDigestMethodError extends Error {
    constructor(digestMethod) {
        super("Digest method " + digestMethod + " unknown")
        this.name = 'UnknownDigestMethodError'
        this.digestMethod = digestMethod
    }
}

class EmptyDataSignError extends Error {
    constructor() {
        super("Cannot sign empty string")
        this.name = 'EmptyDataSignError'
    }
}

class SignFailedError extends Error {
    constructor() {
        super("Failed to sign data, see console for more info. Maybe an invalid digest method?")
        this.name = 'SignFailedError'
    }
}

class WasmBusyError extends Error {
    constructor() {
        super("Wasm is busy computing something else")
        this.name = 'WasmBusyError'
    }
}

class NoPrivateKeyError extends Error {
    constructor(keyId) {
        super("Cannot validate key without private part (" + keyId + ")")
        this.name = 'NoPrivateKeyError'
        this.keyId = keyId
    }
}

class InvalidPrivateKeyError extends Error {
    constructor(privateKey) {
        super("Failed to derive public key from private key. Private key is invalid.")
        this.name = 'InvalidPrivateKeyError'
        this.privateKey = privateKey
    }
}

class WrongDbPasswordError extends Error {
    constructor() {
        super("Failed to decrypt key database (probably due to wrong password)")
        this.name = 'WrongDbPasswordError'
    }
}

class JsonSrSignError extends Error {
    constructor(jsr, reason) {
        super("Failed to sign JSON sign request")
        this.name = 'JsonSrSignError'
        this.jsr = jsr
        this.reason = reason
    }
}

class InvalidJsonSrError extends Error {
    constructor(object, reason) {
        super("Invalid JSON sign request")
        this.name = 'InvalidJsonSrError'
        this.object = object
        this.reason = reason
    }
}

class InvalidPlainTextError extends Error {
    constructor(text, reason) {
        super("Invalid signed plain text")
        this.name = 'InvalidPlainTextError'
        this.text = text
        this.reason = reason
    }
}

class DeriveKeyError extends Error {
    constructor(object, reason) {
        super("Invalid public key or unknown algorithm")
        this.name = 'DeriveKeyError'
        this.object = object
        this.reason = reason
    }
}