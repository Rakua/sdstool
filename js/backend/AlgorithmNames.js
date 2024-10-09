class AlgorithmNames {

    //distinguishes between RSA, ECDSA and EdDSA
    static algorithmType(algorithm) {
        const alg0 = this.canonicalAlgorithmName(algorithm)
        if(alg0 === undefined) return undefined
        let alg = AlgorithmNames.normalizeAlgorithmName(alg0)
        if(alg.startsWith("rsa")) {
            return "rsa"
        } else if(alg.startsWith("ed")) {
            return "ed"
        } else {
            return "ec"
        }
    }

    //returns undefined if algorithm is not supported
    static canonicalAlgorithmName(algorithm) {
        return AlgorithmNames.supportedAlgorithms().find((x) =>
            AlgorithmNames.normalizeAlgorithmName(x) === AlgorithmNames.normalizeAlgorithmName(algorithm))
    }

    //returns undefined if digest method is not supported
    static canonicalDigestMethodName(algorithm) {
        return AlgorithmNames.supportedDigestMethods().find((x) =>
            AlgorithmNames.normalizeAlgorithmName(x) === AlgorithmNames.normalizeAlgorithmName(algorithm))
    }

    //returns intersection of acceptedAlgs and supported algorithms (sorted & canonized)
    static acceptedAlgorithms(acceptedAlgs) {
        let x = acceptedAlgs
            .map(AlgorithmNames.normalizeAlgorithmName)
            .filter(x => AlgorithmNames.supportedAlgorithms().includes(x))
            .map(AlgorithmNames.canonicalAlgorithmName)
        x.sort()
        return x
    }

    //returns intersection of acceptedDms and supported digest methods (sorted & canonized)
    static acceptedDigestMethods(acceptedDms) {
        let x = acceptedDms
            .map(AlgorithmNames.normalizeAlgorithmName)
            .filter(x => AlgorithmNames.supportedDigestMethods().includes(x))
            .map(AlgorithmNames.canonicalDigestMethodName)
        x.sort()
        return x
    }

    static supportedAlgorithms() {
        return [
            "ed25519", "ed448",
            "rsa1024", "rsa1536", "rsa2048", "rsa3072", "rsa4096", "rsa7680", "rsa8192", "rsa15360", "rsa16384",
            "secp112r1", "secp112r2", "secp128r1", "secp128r2", "secp160k1", "secp160r1", "secp160r2", "secp192k1", "secp224k1", "secp224r1", "secp256k1", "secp384r1", "secp521r1",
            "prime192v1", "prime192v2", "prime192v3", "prime239v1", "prime239v2", "prime239v3", "prime256v1", "sect113r1", "sect113r2", "sect131r1", "sect131r2", "sect163k1", "sect163r1", "sect163r2",
            "sect193r1", "sect193r2", "sect233k1", "sect233r1", "sect239k1", "sect283k1", "sect283r1", "sect409k1", "sect409r1", "sect571k1", "sect571r1",
            "c2pnb163v1", "c2pnb163v2", "c2pnb163v3", "c2pnb176v1", "c2tnb191v1", "c2tnb191v2", "c2tnb191v3", "c2pnb208w1", "c2tnb239v1", "c2tnb239v2", "c2tnb239v3", "c2pnb272w1", "c2pnb304w1", "c2tnb359v1", "c2pnb368w1", "c2tnb431r1",
            "wap-wsg-idm-ecid-wtls1", "wap-wsg-idm-ecid-wtls3", "wap-wsg-idm-ecid-wtls4", "wap-wsg-idm-ecid-wtls5", "wap-wsg-idm-ecid-wtls6", "wap-wsg-idm-ecid-wtls7", "wap-wsg-idm-ecid-wtls8", "wap-wsg-idm-ecid-wtls9", "wap-wsg-idm-ecid-wtls10", "wap-wsg-idm-ecid-wtls11", "wap-wsg-idm-ecid-wtls12",
            "brainpoolP160r1", "brainpoolP160t1", "brainpoolP192r1", "brainpoolP192t1", "brainpoolP224r1", "brainpoolP224t1", "brainpoolP256r1", "brainpoolP256t1", "brainpoolP320r1", "brainpoolP320t1", "brainpoolP384r1", "brainpoolP384t1", "brainpoolP512r1", "brainpoolP512t1"
        ]
    }

    static supportedDigestMethods() {
        return ["blake2b512", "blake2s256", "md4", "md5", "md5-sha1", "mdc2", "ripemd", "ripemd160", "rmd160", "sha1", "sha224", "sha256", "sha3-224", "sha3-256", "sha3-384", "sha3-512", "sha384", "sha512", "sha512-224", "sha512-256", "shake128", "shake256", "sm3", "ssl3-md5", "ssl3-sha1", "whirlpool"]
    }

    static normalizeAlgorithmName(algorithm) {
        return algorithm.trim().toLowerCase()
    }

}