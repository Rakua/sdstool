# SDSTool

**⚠️ Important ⚠️**: only use the online version hosted on [https://sdstool.app](https://sdstool.app) to protect your private keys!

SDSTool (Simple Digital Signature Tool) is a program for generating and managing keys as well as signing &amp; verifying plain text and JSON sign requests that runs in the browser. Its purpose is to simplify the use and exchange of digital signatures without being tied to a specific medium such as e-mail. 

It uses OpenSSL via WebAssembly to perform cryptographic operations.

Download offline version (self-hosted):

- Windows: [sdstool-windows-amd64.zip](https://github.com/Rakua/sdstool/releases/download/v1.0.0/sdstool-windows-amd64.zip)
- Linux: [sdstool-linux-amd64.zip](https://github.com/Rakua/sdstool/releases/download/v1.0.0/sdstool-linux-amd64.zip)
- macOS: [sdstool-darwin-amd64.zip](https://github.com/Rakua/sdstool/releases/download/v1.0.0/sdstool-darwin-amd64.zip)

The following algorithms are supported:

- Ed25519 (without context)
- Ed448 (without context)
- ECDSA (with most of the curves supported by OpenSSL 3.3.0)
- RSA (with padding scheme PCKS#1 v1.5) 

A digest method can be chosen when signing with ECDSA or RSA (needs to be enabled in Settings). The default digest method is SHA-256. Custom RNG seed material can be provided for key generation and signing (needs to be enabled in Settings; WebCrypto API is used by default to pass RNG seed material to OpenSSL).

## Build instructions

* Compile OpenSSL to WASM (optional)
  * Follow instructions at [https://github.com/cryptool-org/openssl-webterm](https://github.com/cryptool-org/openssl-webterm?tab=readme-ov-file#compiling-openssl)
  * Copy `openssl.wasm` and `openssl.js` to the `binaries` directory
* Install Golang: https://go.dev/doc/install
* Compile the webserver: `go build sdstool.go`
* Execute the compiled binary (`sdstool.exe` or `sdstool`)
* Open http://localhost:8045 in your browser

## Dependencies

- [DataTables](https://datatables.net/) v1.13.8
- [jQuery](https://jquery.com/) v3.7.1 (required by DataTables)
- [WasmWebTerm](https://github.com/cryptool-org/wasm-webterm) (v0.0.8, b304a23) 
- [OpenSSL](https://www.openssl.org/) v3.3.0 (compiled to WASM)

## Security

Your key database is never stored unencrypted on your hard drive unless you click on `Save` without a password set and accept the warning. For encryption AES256 in CBC mode is used. Keep in mind that browser extensions may be able to access your private keys.

## Formats

All strings are assumed to be encoded in UTF-8.

The KeyId of a key pair is the SHA-256 hash of the base64-encoded bytes between `-----BEGIN PUBLIC KEY-----` and `-----END PUBLIC KEY-----` encoded in url-safe base64. 

### Plain text signature

In this format the signed text and the signature information are separated by an ending phrase. The ending phrase can be either `-----SIGNATURE-----` or `---SIG---` and it must occur in its own line. The last newline character (`\n`) before the ending phrase is *not* part of the signed text. If multiple lines qualify as ending phrase then the last one is assumed to be the one separating the signed text from the signature information.

The signature information consists of the following parts:

1. signature bytes (base64-encoded)
2. public key (base64-encoded X.509 SubjectPublicKeyInfo) or an identifier thereof (e.g. KeyId)
3. used digest method
 
Each part must be separated by at least two newline characters from the previous one. 
The digest method part is optional. If it is not specified, SHA-256 is assumed as default where applicable.

Leading and trailing whitespaces in the signature information should be ignored.

It is recommended to insert a line break after every 64 characters in the base64-encoded parts.

A parser can be found in the method `plainTextToJsonSignRequest` in `js/backend/SDSTool.js`.

### JSON sign request

A JSON sign request is a JSON object that can be used to request a signature from a user for certain data or to represent signed data. It has the following fields:

- `data`: either a string or an object containing the data to be signed/the signed data
- `acceptedAlgorithms`: an array of strings containing the algorithms accepted by the server
- `acceptedDigestMethods`: an array of strings containing the digest methods accepted by the server
- `requestSignaturesFrom`: an array of strings (KeyIds) that specifies which key pairs should sign the request
- `signatures`: an array of signature objects
- `requirePublicKey`: bool which specifies whether a signature object must contain the field `publicKey`

If `data` is an object then its canonical string representation as defined in RFC 8785 must be used for signing and verification. The field `data` must be defined. The field `acceptedAlgorithms` must be defined unless the field `requestSignaturesFrom` is defined.

The field `acceptedDigestMethods` is optional. If it is undefined then it is assumed that only SHA-256 is accepted as digest method.

A signature object consists of:

- `signature`: signature bytes (base64-encoded)
- `publicKey`: base64-encoded X.509 SubjectPublicKeyInfo
- `keyId`
- `digestMethod`: used digest method (optional)

It must contain the field `publicKey` or `keyId`. If `digestMethod` is undefined, SHA-256 is assumed as default where applicable.
