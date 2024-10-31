class WasmWrapper {
    constructor(wasmWebTerm) {
        if(!(wasmWebTerm instanceof WasmWebTerm.default))
            throw new Error("Parameter for WasmWrapper constructor must be instance of WasmWebTerm")

        this.wasmWebTerm = wasmWebTerm

        //setup default callbacks for printing
        this.printCmd = (x) => { console.log("WasmWrapper run cmd:", x) }
        this.printStdout = (x) => { console.log("WasmWrapper stdout:", x) }
        this.printStderr = (x) => { console.log("WasmWrapper stderr:", x) }
    }

    getFile(fileName) {
        fileName = WasmWrapper.normalizeFileName(fileName)
        return this.wasmWebTerm._wasmFsFiles.find((el) => el.name === fileName)
    }

    writeFile(fileName, bytes) {
        fileName = WasmWrapper.normalizeFileName(fileName)
        const uint8Arr = castToUint8Array(bytes)
        const fileRef = this.getFile(fileName)
        if(fileRef === undefined) {
            //file does not exist, create new file            
            this.wasmWebTerm._wasmFsFiles.push({
                "name": fileName,
                "timestamp": Date.now(),
                "bytes": uint8Arr
            })
        } else {
            //overwrite content            
            fileRef.bytes = uint8Arr
            fileRef.timestamp = Date.now()
        }
    }

    removeFile(fileName) {
        fileName = WasmWrapper.normalizeFileName(fileName)
        this.wasmWebTerm._wasmFsFiles = this.wasmWebTerm._wasmFsFiles.filter((x) => x.name !== fileName);
    }

    //e.g. run("openssl version")
    async run(cmd, silent) {
        if(typeof cmd !== "string") throw new Error("Expected string")
        if(silent === undefined || silent === false) this.printCmd(cmd)

        cmd = cmd.split(" ")

        try {
            //headless variant should work but it does not create output files
            //await this.wasmWebTerm.runWasmCommandHeadless(cmd[0], cmd.slice(1))        
            await this.wasmWebTerm.runWasmCommand(cmd[0], cmd.slice(1))
            //let res = this.wasmWebTerm._outputBuffer.slice("loading web assembly ...".length).trimEnd()        
            let res = this.wasmWebTerm._outputBuffer.replace("loading web assembly ...", "").trimEnd()
            if(silent === undefined || silent === false) this.printStdout(res)
            return res
        } catch(e) {
            console.log("wasm run error", e)
            this.printStderr(e.toString().trimStart())
        }
    }

    isBusy() {
        return this.wasmWebTerm.isRunningCommand
    }

    abort() {
        if(this.isBusy()) {
            if(this.wasmWebTerm._worker) {
                this.wasmWebTerm._suppressOutputs = true
                this.wasmWebTerm._terminateWorker()
                this.wasmWebTerm._initWorker() // reinit
                //this.wasmWebTerm._runWasmCommandPromise?.reject("Ctrl + C")
                this.wasmWebTerm.isRunningCommand = false
                console.log("Wasm worker aborted")
                return true
            } else {
                console.log("No wasm worker exists")
                return false
            }
        } else {
            console.log("Wasm worker not busy, nothing to abort")
            return false
        }
    }

    usesWebWorker() {
        return this.wasmWebTerm._worker ? true : false
    }

    static normalizeFileName(fileName) {
        return fileName.startsWith("/") ? fileName : "/" + fileName
    }

}