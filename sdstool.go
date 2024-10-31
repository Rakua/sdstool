package main

import (
	"embed"
	"fmt"
	"net/http"
	"os"
)

const sdstVersion = "1.0.0"
const defaultPort = "8045"
const devMode = false //set to true to enable loading files from file system (hot reload)

const help = `SDSTool version ` + sdstVersion + `, usage:
sdstool       - starts webserver listening on localhost:8045
sdstool $PORT - starts webserver listening on localhost:$PORT`

//go:embed index.html favicon.ico example_redirect.html js/* img/* css/* binaries/*
var staticAssets embed.FS

func main() {
	if len(os.Args) > 1 {
		if os.Args[1] == "help" {
			fmt.Println(help)
			os.Exit(0)
		}
	}

	var fileServer http.Handler
	if devMode {
		fileServer = http.FileServer(http.Dir(""))
	} else {
		fileServer = http.FileServer(http.FS(staticAssets))
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		//headers needed to have SharedArrayBuffer available (required for WasmWebTerm worker)
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")

		//cache content for an hour
		w.Header().Set("Cache-Control", "public, max-age 3600")

		fileServer.ServeHTTP(w, r)
	}

	http.HandleFunc("/", handler)

	//todo: add option to listen to localhost only via flag (listen to all/to localhost/specific address)

	port := defaultPort
	if len(os.Args) > 1 {
		//first cmd-line argument can be used to specify custom listening port for the webserver
		port = os.Args[1]
	}
	addr := fmt.Sprintf("localhost:%v", port)
	fmt.Printf("SDSTool v%v is listening on http://%s\n", sdstVersion, addr)
	if devMode {
		fmt.Println("Dev mode enabled")
	}

	//start the HTTP server
	err := http.ListenAndServe(addr, nil)
	if err != nil {
		fmt.Println("Error:", err)
	}
}
