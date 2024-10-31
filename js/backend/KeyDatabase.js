class KeyDatabase {

    //create empty key database
    constructor(dbName) {
        const d = new Date()
        const dStr = Math.round((d.valueOf() / 1000))
        const rndArr = new Uint8Array(32)
        self.crypto.getRandomValues(rndArr)        

        this.dbName = dbName !== undefined ? dbName : "sdstKeyDb" + dStr
        this.createdOn = d
        this.guid = d.valueOf()+":"+base64FromBytes(rndArr) 
        this.keys = []
        this.listeners = []
        /*
            guid is used to determine if two key databases are the 'same' when
            deciding whether to overwrite a database in the browser's local 
            storage
        */

    }

    //register listeners for when the database is mutated    
    //used to update the tables in the GUI on change
    onChange(callback) {        
        this.listeners.push(callback)
        /*
            callback(methodName, data)
                methodName = method in KeyDatabase that caused the mutation
                data = see method's definition for what data is passed
        */        
    }

    reload() {
        this.listeners.forEach(f => f("reload", this))
    }

    /* read-only methods */

    getDbName() {
        return this.dbName
    }

    getGuid() {
        return this.guid
    }

    getCreatedOn() {
        return this.createdOn
    }

    getKeyByAlias(alias) {
        return this.keys.find((k) => k.alias === alias)
    }

    getKeyById(keyId) {
        return this.keys.find((k) => k.keyId === keyId)
    }

    getKeysByKeyIdPrefix(keyIdPrefix) {
        return this.keys.filter(k => k.keyId.startsWith(keyIdPrefix))
    }

    getKeyByPublicKey(publicKey) {
        return this.keys.find((k) => k.publicKey === publicKey)
    }

    keyIdExists(keyId) {
        return this.getKeyById(keyId) !== undefined
    }

    aliasExists(alias) {
        return this.getKeyByAlias(alias) !== undefined
    }

    static isKeyPair(key) {
        return key.privateKey !== undefined
    }

    getKeyPairs() {
        return this.keys.filter((k) => KeyDatabase.isKeyPair(k))
    }

    getPublicKeys() {
        return this.keys.filter((k) => !KeyDatabase.isKeyPair(k))
    }


    /* mutating methods */

    //privateKey = undefined => adds a public key
    addKey(alias, keyId, alg, publicKey, privateKey, addedOn) {
        if(this.keyIdExists(keyId)) throw new KeyIdExistsError(keyId)

        alias = this.chooseAlias(alias, keyId)
        if(publicKey instanceof Uint8Array) publicKey = stringFromUtf8Bytes(publicKey)
        if(privateKey instanceof Uint8Array) privateKey = stringFromUtf8Bytes(privateKey)
        if(addedOn === undefined) addedOn = new Date()

        const key = {
            "alias": alias,
            "keyId": keyId,
            "algorithm": alg,
            "publicKey": publicKey,
            "privateKey": privateKey,
            "addedOn": addedOn
        }
        this.keys.push(key)
        this.listeners.forEach(f => f("addKey", key))
        return key
    }

    setAlias(keyId, alias) {
        if(this.aliasExists(alias)) throw new AliasExistsError(alias)
        const key = this.getKeyById(keyId)
        key.alias = alias
        this.listeners.forEach(f => f("setAlias", key))
    }

    setDbName(dbName) {
        this.dbName = dbName
        this.listeners.forEach(f => f("setDbName", dbName))
    }

    deleteKey(keyId) {
        const n = this.keys.length
        this.keys = this.keys.filter((k) => k.keyId !== keyId)
        //only fire delete event if a key was actually deleted
        if(n > this.keys.length) this.listeners.forEach(f => f("deleteKey", keyId))
    }


    /* alias related */

    chooseAlias(alias, keyId) {
        //no alias => choose first 8 chars of keyId
        if(alias === undefined || alias === "") alias = keyId.slice(0, 12)
        return this.nextFreeAlias(alias)
    }

    nextFreeAlias(alias) {
        let i = 1
        let freeAlias = alias
        while(this.aliasExists(freeAlias)) {
            i++
            freeAlias = alias + " (" + i + ")"
        }
        return freeAlias
    }

    /* (de)serialization */
    toJson() {
        const replacer = (key, value) => key === "listeners" ? undefined : value

        let x = JSON.stringify(this, replacer, 2)
        return x
    }

    //returns KeyDatabase instance
    static fromJson(jsonStr) {
        const d = new Date()
        const dStr = Math.round((d.valueOf() / 1000))

        const db = new KeyDatabase()
        const data = JSON.parse(jsonStr)
        db.dbName = data.createdOn === undefined ? "sdstKeyDb" + dStr : data.dbName
        db.createdOn = data.createdOn === undefined ? d : new Date(data.createdOn)
        db.guid = data.guid === undefined ? "0000000000000000000000000000000000000000000=" : data.guid
                                             
        for(const key of data.keys) {
            if(key.publicKey === undefined) throw new KeyPublicKeyMissingError(key)
            if(key.algorithm === undefined) throw new KeyAlgorithmMissingError(key)
            if(key.keyId === undefined) throw new KeyIdMissingError(key)

            key.alias = db.chooseAlias(key.alias, key.keyId)
            if(key.addedOn !== undefined) {
                key.addedOn = new Date(key.addedOn)
                if(isNaN(key.addedOn)) key.addedOn = undefined
            }

            if(db.getKeyById(key.keyId) !== undefined) throw new KeyIdExistsError(key.keyId)
            db.keys.push(key)
        }

        return db
    }
}

class KeyIdExistsError extends Error {
    constructor(keyId, alias) {
        super("KeyId already exists (" + keyId + ")")
        this.name = 'KeyIdExistsError'
        this.keyId = keyId
    }
}

class KeyIdMissingError extends Error {
    constructor(key) {
        super("KeyId missing from key:\n" + JSON.stringify(key, 2))
        this.name = 'KeyIdMissingError'
        this.key = key
    }
}

class KeyPublicKeyMissingError extends Error {
    constructor(key) {
        super("Public key missing from key:\n" + JSON.stringify(key, 2))
        this.name = 'KeyPublicKeyMissingError'
        this.key = key
    }
}

class KeyAlgorithmMissingError extends Error {
    constructor(key) {
        super("Algorithm missing from key:\n" + JSON.stringify(key, 2))
        this.name = 'KeyAlgorithmMissingError'
        this.key = key
    }
}

class InvalidCiphertextError extends Error {
    constructor(key) {
        super("Encrypted key database should start with 'ENCRYPTED '")
        this.name = 'InvalidCiphertextError'
    }
}