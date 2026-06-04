fn main() {
    // ScreenCaptureKit (via the `screencapturekit` crate) pulls in Swift code that
    // references the Swift concurrency runtime. Outside an Xcode build the linked
    // binary has no rpath to the system Swift runtime, so it crashes at launch
    // with "Library not loaded: @rpath/libswift_Concurrency.dylib". Add an rpath
    // to the OS Swift runtime dir (resolved from the dyld shared cache at runtime).
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }

    tauri_build::build();
}
