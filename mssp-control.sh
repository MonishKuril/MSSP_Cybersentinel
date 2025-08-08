#!/bin/bash

# MSSP Cybersentinel Backend Advanced Control Script
# This script provides complete control over the backend server

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
PID_FILE="$SCRIPT_DIR/mssp_backend.pid"
LOG_FILE="$SCRIPT_DIR/mssp_backend.log"
ERROR_LOG="$SCRIPT_DIR/mssp_error.log"

# Function to print colored messages
print_message() {
    echo -e "${2}${1}${NC}"
}

# Function to print header
print_header() {
    echo -e "${CYAN}================================${NC}"
    echo -e "${CYAN}  MSSP Cybersentinel Backend    ${NC}"
    echo -e "${CYAN}       Control Panel            ${NC}"
    echo -e "${CYAN}================================${NC}"
}

# Function to check if backend is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            return 0
        else
            # Clean up stale PID file
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Function to get backend port
get_port() {
    if [ -f "$BACKEND_DIR/.env" ]; then
        PORT=$(grep -E "^PORT=" "$BACKEND_DIR/.env" | cut -d '=' -f2)
        if [ -z "$PORT" ]; then
            PORT="3000"  # Default port
        fi
    else
        PORT="3000"  # Default port
    fi
    echo $PORT
}

# Function to check prerequisites
check_prerequisites() {
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_message "❌ Node.js is not installed!" $RED
        return 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_message "❌ npm is not installed!" $RED
        return 1
    fi
    
    # Check backend directory
    if [ ! -d "$BACKEND_DIR" ]; then
        print_message "❌ Backend directory not found at: $BACKEND_DIR" $RED
        return 1
    fi
    
    # Check package.json
    if [ ! -f "$BACKEND_DIR/package.json" ]; then
        print_message "❌ package.json not found in backend directory!" $RED
        return 1
    fi
    
    return 0
}

# Function to install dependencies
install_dependencies() {
    print_message "📦 Checking dependencies..." $YELLOW
    
    cd "$BACKEND_DIR"
    
    if [ ! -d "node_modules" ] || [ ! -f "package-lock.json" ]; then
        print_message "Installing npm dependencies..." $YELLOW
        npm install
        if [ $? -ne 0 ]; then
            print_message "❌ Failed to install dependencies!" $RED
            return 1
        fi
        print_message "✅ Dependencies installed successfully!" $GREEN
    else
        print_message "✅ Dependencies already installed!" $GREEN
    fi
    
    return 0
}

# Function to start the backend
start_backend() {
    print_header
    print_message "🚀 Starting MSSP Cybersentinel Backend..." $BLUE
    
    # Check if already running
    if is_running; then
        PID=$(cat "$PID_FILE")
        print_message "⚠️  Backend is already running!" $YELLOW
        print_message "Process ID: $PID" $YELLOW
        return 1
    fi
    
    # Check prerequisites
    if ! check_prerequisites; then
        return 1
    fi
    
    # Install dependencies
    if ! install_dependencies; then
        return 1
    fi
    
    # Change to backend directory
    cd "$BACKEND_DIR"
    
    # Start the backend in background
    print_message "🔄 Starting backend server..." $YELLOW
    
    # Clear old logs
    > "$LOG_FILE"
    > "$ERROR_LOG"
    
    # Start with nohup to keep running after terminal closes
    nohup npm start > "$LOG_FILE" 2> "$ERROR_LOG" &
    
    # Save PID
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PID_FILE"
    
    # Wait a moment to check if it started successfully
    print_message "⏳ Waiting for backend to initialize..." $YELLOW
    sleep 5
    
    if is_running; then
        PORT=$(get_port)
        print_message "✅ Backend started successfully!" $GREEN
        print_message "📋 Process ID: $(cat $PID_FILE)" $GREEN
        print_message "🌐 Port: $PORT" $GREEN
        print_message "📄 Log file: $LOG_FILE" $GREEN
        print_message "❌ Error log: $ERROR_LOG" $GREEN
        print_message "" $NC
        print_message "🔗 Access your application at: http://localhost:$PORT" $CYAN
        print_message "" $NC
        print_message "💡 Use './mssp-control.sh status' to check status" $BLUE
        print_message "💡 Use './mssp-control.sh logs' to view logs" $BLUE
    else
        print_message "❌ Failed to start backend!" $RED
        print_message "Check error log: $ERROR_LOG" $RED
        if [ -f "$ERROR_LOG" ]; then
            print_message "Recent errors:" $RED
            tail -n 10 "$ERROR_LOG"
        fi
        return 1
    fi
}

# Function to stop the backend
stop_backend() {
    print_header
    print_message "🛑 Stopping MSSP Cybersentinel Backend..." $BLUE
    
    if ! is_running; then
        print_message "⚠️  Backend is not running!" $YELLOW
        return 1
    fi
    
    PID=$(cat "$PID_FILE")
    print_message "🔄 Stopping process $PID..." $YELLOW
    
    # Try graceful shutdown first
    kill $PID
    
    # Wait for process to stop
    for i in {1..10}; do
        if ! is_running; then
            break
        fi
        sleep 1
        echo -n "."
    done
    echo ""
    
    if ! is_running; then
        print_message "✅ Backend stopped successfully!" $GREEN
        rm -f "$PID_FILE"
    else
        print_message "⚠️  Graceful shutdown failed, force killing..." $YELLOW
        kill -9 $PID 2>/dev/null
        rm -f "$PID_FILE"
        print_message "✅ Backend force stopped!" $GREEN
    fi
}

# Function to show detailed status
show_status() {
    print_header
    
    if is_running; then
        PID=$(cat "$PID_FILE")
        PORT=$(get_port)
        
        print_message "✅ MSSP Backend Status: RUNNING" $GREEN
        print_message "📋 Process ID: $PID" $GREEN
        print_message "🌐 Port: $PORT" $GREEN
        
        # Show memory usage
        if command -v ps >/dev/null 2>&1; then
            MEM_USAGE=$(ps -p $PID -o %mem --no-headers 2>/dev/null | tr -d ' ')
            if [ ! -z "$MEM_USAGE" ]; then
                print_message "💾 Memory Usage: ${MEM_USAGE}%" $GREEN
            fi
        fi
        
        # Show uptime
        if command -v ps >/dev/null 2>&1; then
            UPTIME=$(ps -p $PID -o etime --no-headers 2>/dev/null | tr -d ' ')
            if [ ! -z "$UPTIME" ]; then
                print_message "⏰ Uptime: $UPTIME" $GREEN
            fi
        fi
        
        # Check if port is listening
        if command -v netstat >/dev/null 2>&1; then
            if netstat -tlnp 2>/dev/null | grep ":$PORT " | grep -q "$PID"; then
                print_message "🔗 Status: Listening on port $PORT" $GREEN
                print_message "🌐 URL: http://localhost:$PORT" $CYAN
            else
                print_message "⚠️  Warning: Process running but not listening on expected port" $YELLOW
            fi
        fi
        
        print_message "📄 Log file: $LOG_FILE" $BLUE
        print_message "❌ Error log: $ERROR_LOG" $BLUE
        
    else
        print_message "❌ MSSP Backend Status: NOT RUNNING" $RED
        
        # Check if there are any zombie processes
        if pgrep -f "npm start" >/dev/null; then
            print_message "⚠️  Warning: Found npm processes that might be related" $YELLOW
            print_message "Run './mssp-control.sh cleanup' to clean them up" $YELLOW
        fi
    fi
}

# Function to restart the backend
restart_backend() {
    print_header
    print_message "🔄 Restarting MSSP Cybersentinel Backend..." $BLUE
    
    if is_running; then
        stop_backend
        sleep 3
    fi
    
    start_backend
}

# Function to show logs
show_logs() {
    print_header
    
    if [ "$2" == "error" ]; then
        if [ -f "$ERROR_LOG" ]; then
            print_message "❌ Showing error logs (last 50 lines):" $RED
            echo ""
            tail -n 50 "$ERROR_LOG"
        else
            print_message "No error log file found" $YELLOW
        fi
    else
        if [ -f "$LOG_FILE" ]; then
            print_message "📄 Showing backend logs (last 50 lines):" $BLUE
            echo ""
            tail -n 50 "$LOG_FILE"
        else
            print_message "No log file found" $YELLOW
        fi
    fi
}

# Function to follow logs in real-time
follow_logs() {
    print_header
    print_message "📄 Following backend logs (Press Ctrl+C to stop):" $BLUE
    echo ""
    
    if [ -f "$LOG_FILE" ]; then
        tail -f "$LOG_FILE"
    else
        print_message "No log file found" $YELLOW
    fi
}

# Function to cleanup zombie processes
cleanup_processes() {
    print_header
    print_message "🧹 Cleaning up zombie processes..." $YELLOW
    
    # Kill any npm start processes
    pkill -f "npm start" 2>/dev/null
    
    # Remove PID file if exists
    rm -f "$PID_FILE"
    
    print_message "✅ Cleanup completed!" $GREEN
}

# Function to show system info
show_info() {
    print_header
    print_message "ℹ️  System Information:" $BLUE
    echo ""
    
    print_message "📁 Script Directory: $SCRIPT_DIR" $NC
    print_message "📁 Backend Directory: $BACKEND_DIR" $NC
    print_message "📄 PID File: $PID_FILE" $NC
    print_message "📄 Log File: $LOG_FILE" $NC
    print_message "📄 Error Log: $ERROR_LOG" $NC
    
    if command -v node >/dev/null 2>&1; then
        NODE_VERSION=$(node --version)
        print_message "🟢 Node.js Version: $NODE_VERSION" $GREEN
    else
        print_message "❌ Node.js: Not installed" $RED
    fi
    
    if command -v npm >/dev/null 2>&1; then
        NPM_VERSION=$(npm --version)
        print_message "📦 npm Version: $NPM_VERSION" $GREEN
    else
        print_message "❌ npm: Not installed" $RED
    fi
    
    if [ -f "$BACKEND_DIR/package.json" ]; then
        APP_NAME=$(grep '"name"' "$BACKEND_DIR/package.json" | cut -d '"' -f4)
        APP_VERSION=$(grep '"version"' "$BACKEND_DIR/package.json" | cut -d '"' -f4)
        print_message "🚀 Application: $APP_NAME v$APP_VERSION" $CYAN
    fi
}

# Main script logic
case "$1" in
    start)
        start_backend
        ;;
    stop)
        stop_backend
        ;;
    restart)
        restart_backend
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "$@"
        ;;
    follow)
        follow_logs
        ;;
    cleanup)
        cleanup_processes
        ;;
    info)
        show_info
        ;;
    *)
        print_header
        print_message "🎛️  MSSP Cybersentinel Backend Control Script" $CYAN
        echo ""
        print_message "Usage: $0 {command}" $YELLOW
        echo ""
        print_message "Available Commands:" $BLUE
        print_message "  start     - Start the backend server" $NC
        print_message "  stop      - Stop the backend server" $NC
        print_message "  restart   - Restart the backend server" $NC
        print_message "  status    - Show detailed status information" $NC
        print_message "  logs      - Show recent backend logs" $NC
        print_message "  logs error - Show recent error logs" $NC
        print_message "  follow    - Follow logs in real-time" $NC
        print_message "  cleanup   - Clean up zombie processes" $NC
        print_message "  info      - Show system information" $NC
        echo ""
        print_message "Examples:" $PURPLE
        print_message "  ./mssp-control.sh start" $NC
        print_message "  ./mssp-control.sh status" $NC
        print_message "  ./mssp-control.sh logs error" $NC
        echo ""
        exit 1
        ;;
esac

exit 0
