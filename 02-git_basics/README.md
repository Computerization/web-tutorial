# 02: Git Basics
This tutorial covers the fundamental concepts of Version Control Systems (VCS) and the essential Git workflow used in professional web development.

## 🚀 Key Concepts
Version Control System (VCS): A system that records changes to a file or set of files over time so that you can recall specific versions later.

Repository (Repo): A central location where all the files for a particular project are stored, including the history of all changes made to them.

Commit: A snapshot of your code at a specific point in time, acting as a "save point" in your project's history.

## 🛠️ Essential Git Commands
The following commands represent the core workflow for managing project versions:

**git init:** Initializes a new Git repository in your current directory.

**git clone [URL]:** Creates a local copy of a remote repository from GitHub.

**git status:** Displays the state of the working directory and the staging area, showing which changes have been staged.

**git add [file]**: Adds a change in the working directory to the staging area.

**git commit -m "[message]":** Captures a snapshot of the project's currently staged changes with a descriptive message.

**git push:** Sends your local branch commits to the remote repository on GitHub.

## 📂 The Git Workflow
Understanding the three states of Git is crucial for managing your code effectively:

Working Directory: Where you do the actual work—modifying, adding, or deleting files.

Staging Area (Index): A file that stores information about what will go into your next commit.

Git Directory (Repository): Where Git stores the metadata and object database for your project.

## 📝 Practice Exercise
Create a new folder on your computer.

Run git init to start tracking changes.

Create a file named hello.txt and run git add hello.txt.

Save your progress using git commit -m "First commit".

[← Back to Home](../README.md)