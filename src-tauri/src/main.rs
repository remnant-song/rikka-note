// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

extern "C" {
    fn desktop_run();
}

fn main() {
    unsafe { desktop_run(); }
}