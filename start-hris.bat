@echo off
echo =========================================================================
echo   Starting SHRM HRIS - Local-First Mode (Port 3000)
echo   Application Folder: %~dp0
echo   Production Database: E:\SHRM_HRIS\Database.db
echo   Production Storage:  E:\SHRM_HRIS\
echo =========================================================================

:: Ensure Data Directories Exist in E:\SHRM_HRIS\
if not exist "E:\SHRM_HRIS" mkdir "E:\SHRM_HRIS"
if not exist "E:\SHRM_HRIS\Documents" mkdir "E:\SHRM_HRIS\Documents"
if not exist "E:\SHRM_HRIS\Documents\Employees" mkdir "E:\SHRM_HRIS\Documents\Employees"
if not exist "E:\SHRM_HRIS\Backups" mkdir "E:\SHRM_HRIS\Backups"
if not exist "E:\SHRM_HRIS\Imports" mkdir "E:\SHRM_HRIS\Imports"
if not exist "E:\SHRM_HRIS\Exports" mkdir "E:\SHRM_HRIS\Exports"
if not exist "E:\SHRM_HRIS\Logs" mkdir "E:\SHRM_HRIS\Logs"

:: Set Local Windows Environment Variables
set LOCAL_MODE=true
set LOCAL_DB_PATH=E:\SHRM_HRIS\Database.db
set LOCAL_STORAGE_PATH=E:\SHRM_HRIS
set FIREBASE_OPTIONAL=true

echo Opening application in default browser...
start http://localhost:3000

echo Starting Node.js / Express HRIS Server...
npm run dev
