package main

import (
	"embed"
	"fmt"
	"net/http"
	"os"
)

const sdstVersion = "1.0.1"
const defaultPort = "8045"
const devMode = false // set to true to enable loading files from file system (hot reload)
const mark = "2026/04/10"

const help = `SDSTool version ` + sdstVersion + `, usage:
sdstool       - starts webserver listening on localhost:8045
sdstool $PORT - starts webserver listening on localhost:$PORT`

//go:embed index.html favicon.ico example_request.html example_request_fragment_id.html js/* img/* css/* binaries/*
var staticAssets embed.FS

func main() {
	if len(os.Args) > 1 {
		if os.Args[1] == "help" {
			fmt.Println(help)
			os.Exit(0)
		}
	}

	var fileServer http.Handler
	var indexFile []byte
	var err error

	if devMode {
		//serve files from file system (hot reload)
		fileServer = http.FileServer(http.Dir(""))
		indexFile, err = staticAssets.ReadFile("index.html")
		if err != nil {
			fmt.Println("Error reading index.html", err)
			os.Exit(1)
		}
	} else {
		//serve files embedded in binary
		fileServer = http.FileServer(http.FS(staticAssets))
		indexFile, err = staticAssets.ReadFile("index.html")
		if err != nil {
			fmt.Println("Error reading index.htm", err)
			os.Exit(1)
		}
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		// cache content for an hour
		w.Header().Set("Cache-Control", "public, max-age 3600")

		if r.URL.Path == "/request.html" {
			// serve index.html when /request.html is requested

			/*
				In order for sign and verify requests via postMessage to work, the
				header Cross-Origin-Opener-Policy cannot be set to same-origin
				since this would cause window.opener to be null when a requestor
				opens SDSTool to send a	request.

				As a workaround requests are sent to /request.html where this header
				is not set (and consequently WebWorkers do not work).
			*/

			w.Write(indexFile)
			return
		}

		// headers needed to have SharedArrayBuffer available for WebWorker
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
			w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")
		}

		fileServer.ServeHTTP(w, r)
	}

	http.HandleFunc("/", handler)

	port := defaultPort
	if len(os.Args) > 1 {
		// first cmd-line argument can be used to specify custom listening port
		port = os.Args[1]
	}
	addr := fmt.Sprintf("localhost:%v", port)
	fmt.Printf("SDSTool v%v (%v) is listening on http://%s\n", sdstVersion, mark, addr)
	if devMode {
		fmt.Println("Dev mode enabled")
	}

	// start the HTTP server
	err = http.ListenAndServe(addr, nil)
	if err != nil {
		fmt.Println("Error:", err)
	}
}
