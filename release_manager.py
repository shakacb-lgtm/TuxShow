#!/usr/bin/env python3
import gi
gi.require_version('Gtk', '3.0')
from gi.repository import Gtk
import json
import subprocess
import glob
import os

class GitHubUploader(Gtk.Window):
    def __init__(self):
        super().__init__(title="TuxShow Release Manager")
        self.set_border_width(20)
        self.set_default_size(450, 200)

        vbox = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=15)
        self.add(vbox)

        self.status_label = Gtk.Label(label="Load package.json to begin.")
        vbox.pack_start(self.status_label, False, False, 0)

        load_button = Gtk.Button(label="1. Read package.json")
        load_button.connect("clicked", self.load_version)
        vbox.pack_start(load_button, False, False, 0)

        self.notes_entry = Gtk.Entry()
        self.notes_entry.set_placeholder_text("Enter release notes...")
        vbox.pack_start(self.notes_entry, False, False, 0)

        self.upload_button = Gtk.Button(label="2. Upload to GitHub")
        self.upload_button.connect("clicked", self.upload_release)
        self.upload_button.set_sensitive(False)  
        vbox.pack_start(self.upload_button, False, False, 0)

        self.version_tag = None
        self.raw_version = None

    def load_version(self, widget):
        try:
            with open('package.json', 'r') as file:
                data = json.load(file)
                self.raw_version = data['version']
                self.version_tag = f"v{self.raw_version}"
                self.status_label.set_markup(f"<b>Ready to release:</b> {self.version_tag}")
                self.upload_button.set_sensitive(True) 
        except FileNotFoundError:
            self.status_label.set_markup("<span foreground='red'><b>Error:</b> package.json not found!</span>")
        except KeyError:
            self.status_label.set_markup("<span foreground='red'><b>Error:</b> No version found in package.json!</span>")

    def upload_release(self, widget):
        notes = self.notes_entry.get_text() or "Automated build upload."
        
        # 1. Gather the .deb files
        search_pattern = f"./release/*{self.raw_version}*.deb"
        deb_files = glob.glob(search_pattern)

        if not deb_files:
            self.status_label.set_markup(f"<span foreground='red'><b>Error:</b> No .deb files for v{self.raw_version} found in ./release/</span>")
            return

        # 2. Gather any PDF manuals in a ./docs/ folder
        pdf_files = glob.glob("./docs/*.pdf")
        
        # Combine all files into one upload list
        all_files_to_upload = deb_files + pdf_files

        # Update UI text to show what is being uploaded
        doc_text = f" and {len(pdf_files)} manual(s)" if pdf_files else ""
        self.status_label.set_text(f"Uploading {len(deb_files)} build(s){doc_text} to GitHub... Please wait.")
        
        while Gtk.events_pending():
            Gtk.main_iteration()

        # 3. Construct the GitHub CLI command
        command = ["gh", "release", "create", self.version_tag]
        command.extend(all_files_to_upload) # Adds both .deb and .pdf files
        command.extend(["--title", f"TuxShow {self.version_tag}", "--notes", notes])

        try:
            subprocess.run(command, check=True)
            self.status_label.set_markup(f"<span foreground='green'><b>Success!</b> {self.version_tag} is live with {len(all_files_to_upload)} files.</span>")
            self.notes_entry.set_text("") 
            self.upload_button.set_sensitive(False)
        except subprocess.CalledProcessError:
            self.status_label.set_markup("<span foreground='red'><b>Error:</b> Upload failed. Check terminal for details.</span>")

if __name__ == "__main__":
    app = GitHubUploader()
    app.connect("destroy", Gtk.main_quit)
    app.show_all()
    Gtk.main()
