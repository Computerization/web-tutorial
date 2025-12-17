# Quick Access Tab

Version: 1.2.4

Developer: yszdlzn3195918

## Overview

Quick Access Tab is a lightweight, modern Google Chrome extension designed to replace the default new tab page. It provides a streamlined interface focusing on productivity and aesthetics, featuring an integrated Google search bar, customizable quick navigation links, a persistent note-taking system, and a weekly reminder tracker.

The application utilizes local storage to persist user data (notes and reminders) without requiring external database connections or account creation.

## Features

### Integrated Search: 

A central search bar that queries Google directly. The input field automatically focuses upon opening a new tab for immediate typing.

### Quick Navigation: 

Pre-configured shortcuts to frequently visited websites and social media profiles.

### Productivity Tools:

 - Weekly Reminders: A dedicated panel for managing recurring weekly tasks, capable of filtering views by the current day.

 - Dynamic Interface: Features a glassmorphism-inspired design with subtle animations, responsive layout, and real-time date/time display (GMT offset included).

## Project Structure

The project consists of the following core files:

 - manifest.json: The configuration file required by Chrome to define extension permissions, versioning, and the new tab override setting.

 - newtab_modern.html: The main HTML structure defining the layout of the new tab page.

 - styles.css: Contains all styling rules, including animations, responsive breakpoints, and the dark-themed color palette.

 - script.js: Handles the application logic, including time updates, local storage management for notes/reminders, and DOM manipulation.

 - img/: A directory containing the image assets used for the quick link icons.

## Installation Instructions

To install this extension in Google Chrome:

 - Download the project files to a local directory. Ensure the img folder is present and contains the necessary assets.

 - Open Google Chrome and navigate to chrome://extensions/.

 - Enable Developer mode using the toggle switch in the top right corner.

 - Click the Load unpacked button.

 - Select the directory containing the project files (manifest.json must be in the root of this directory).

 - Open a new tab to verify the installation.

## Personalization Guide

Users may wish to modify the default "Quick Links" to reflect their own preferred websites. This requires editing the HTML source code.

### Modifying Quick Links

 - Open newtab_modern.html in a text editor (e.g., Notepad, VS Code, Sublime Text).

 - Locate the section containing the class quick-links.

 - Each link is wrapped in an anchor tag (<a ...>). To change a link, modify the following attributes:

   - Link URL: Change the href attribute to the desired destination URL.
   
    - Image: Change the src attribute of the <img> tag to point to your new image file.

   - Label: Update the text inside the <p> tag.

### Adding Custom Images

 - Save your desired icon images (square aspect ratio recommended) into the img/ folder.

 - Reference the filename in the src attribute as shown in the example above.

## Data Persistence

This extension stores user data (Notes and Reminders) in the browser's localStorage. Clearing the browser's cache or local data for the extension will result in the loss of saved notes and reminders.

## License

This project is provided for personal use. All rights reserved by the developer.