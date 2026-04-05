#!/bin/bash

# Define the root directory to start the search
TARGET_DIR="./build/wp-content"
# API Endpoint
BASE_URL="http://localhost:8080/wp-content"

# Check if directory exists
if [ ! -d "$TARGET_DIR" ]; then
  echo "Error: Directory $TARGET_DIR does not exist."
  exit 1
fi

# Use 'find' to locate all files recursively
find "$TARGET_DIR" -type f -print0 | while IFS= read -r -d '' filepath; do
    clean_path="${filepath#$TARGET_DIR/}" 
    if curl -s -L -G "$BASE_URL/$clean_path" \
        -o "${filepath}.tmp"; then
        
        # Replace the original file with the downloaded result
        mv "${filepath}.tmp" "$filepath"
        echo "Successfully updated: $filepath"
    else
        echo "Failed to process: $filepath"
        # Clean up the temp file if the download failed
        rm -f "${filepath}.tmp"
    fi

done

echo "All files processed."