/**
 * Copyright 2023-present DreamNum Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { CommandListener, ICommandInfo, IDisposable, IRange, IWorkbookData, LocaleType, Workbook } from '@univerjs/core';
import type { ISetSelectionsOperationParams, ISheetCommandSharedParams } from '@univerjs/sheets';
import { FBase, ICommandService, ILogService, Inject, Injector, IPermissionService, IResourceLoaderService, IUniverInstanceService, LocaleService, mergeWorksheetSnapshotWithDefault, RedoCommand, toDisposable, UndoCommand, UniverInstanceType } from '@univerjs/core';
import { CopySheetCommand, getPrimaryForRange, InsertSheetCommand, RemoveSheetCommand, SetSelectionsOperation, SetWorksheetActiveOperation, SetWorksheetOrderCommand, SheetsSelectionsService, WorkbookEditablePermission } from '@univerjs/sheets';
import { FPermission } from './f-permission';
import { FRange } from './f-range';
import { FWorksheet } from './f-worksheet';

export class FWorkbook extends FBase {
    readonly id: string;

    constructor(
        protected readonly _workbook: Workbook,
        @Inject(Injector) protected readonly _injector: Injector,
        @Inject(IResourceLoaderService) protected readonly _resourceLoaderService: IResourceLoaderService,
        @Inject(SheetsSelectionsService) protected readonly _selectionManagerService: SheetsSelectionsService,
        @IUniverInstanceService protected readonly _univerInstanceService: IUniverInstanceService,
        @ICommandService protected readonly _commandService: ICommandService,
        @IPermissionService protected readonly _permissionService: IPermissionService,
        @ILogService protected readonly _logService: ILogService,
        @Inject(LocaleService) protected readonly _localeService: LocaleService
    ) {
        super();

        this.id = this._workbook.getUnitId();
    }

    /**
     * Get the id of the workbook.
     * @returns {string} The id of the workbook.
     * @example
     * ```ts
     * // The code below gets the id of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const id = activeSpreadsheet.getId();
     * ```
     */
    getId(): string {
        return this.id;
    }

    /**
     * Get the name of the workbook.
     * @returns {string} The name of the workbook.
     * @example
     * ```ts
     * // The code below gets the name of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const name = activeSpreadsheet.getName();
     * ```
     */
    getName(): string {
        return this._workbook.name;
    }

    /**
     * Set the name of the workbook.
     * @param {string} name The new name of the workbook.
     * @example
     * ```ts
     * // The code below sets the name of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.setName('MyWorkbook');
     * ```
     */
    setName(name: string) {
        this._workbook.setName(name);
    }

    /**
     * save workbook snapshot data, including conditional formatting, data validation, and other plugin data.
     * @return Workbook snapshot data
     * @example
     * ```ts
     * // The code below saves the workbook snapshot data
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const snapshot = activeSpreadsheet.save();
     * ```
     */
    save(): IWorkbookData {
        const snapshot = this._resourceLoaderService.saveUnit<IWorkbookData>(this._workbook.getUnitId())!;
        return snapshot;
    }

    /**
     * @deprecated use 'save' instead.
     * @return {*}  {IWorkbookData} Workbook snapshot data
     * @memberof FWorkbook
     */
    getSnapshot(): IWorkbookData {
        this._logService.warn('use \'save\' instead of \'getSnapshot\'');
        return this.save();
    }

    /**
     * Get the active sheet of the workbook.
     * @returns The active sheet of the workbook
     * @example
     * ```ts
     * // The code below gets the active sheet of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const activeSheet = activeSpreadsheet.getActiveSheet();
     * ```
     */
    getActiveSheet(): FWorksheet {
        const activeSheet = this._workbook.getActiveSheet();
        return this._injector.createInstance(FWorksheet, this, this._workbook, activeSheet);
    }

    /**
     * Gets all the worksheets in this workbook
     * @returns An array of all the worksheets in the workbook
     * @example
     * ```ts
     * // The code below gets all the worksheets in the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheets = activeSpreadsheet.getSheets();
     * ```
     */
    getSheets(): FWorksheet[] {
        return this._workbook.getSheets().map((sheet) => {
            return this._injector.createInstance(FWorksheet, this, this._workbook, sheet);
        });
    }

    /**
     * Create a new worksheet and returns a handle to it.
     * @param name Name of the new sheet
     * @param rows How may rows would the new sheet have
     * @param column How many columns would the new sheet have
     * @returns The new created sheet
     * @example
     * ```ts
     * // The code below creates a new sheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const newSheet = activeSpreadsheet.create('MyNewSheet', 10, 10);
     * ```
     */
    create(name: string, rows: number, column: number): FWorksheet {
        const newSheet = mergeWorksheetSnapshotWithDefault({});
        newSheet.rowCount = rows;
        newSheet.columnCount = column;
        newSheet.name = name;
        newSheet.id = name.toLowerCase().replace(/ /g, '-');

        this._commandService.syncExecuteCommand(InsertSheetCommand.id, {
            unitId: this.id,
            index: this._workbook.getSheets().length,
            sheet: newSheet,
        });

        this._commandService.syncExecuteCommand(SetWorksheetActiveOperation.id, {
            unitId: this.id,
            subUnitId: this._workbook.getSheets()[this._workbook.getSheets().length - 1].getSheetId(),
        });

        const worksheet = this._workbook.getActiveSheet();
        if (!worksheet) {
            throw new Error('No active sheet found');
        }

        return this._injector.createInstance(FWorksheet, this, this._workbook, worksheet);
    }

    /**
     * Get a worksheet by sheet id.
     * @param sheetId The id of the sheet to get.
     * @return The worksheet with given sheet id
     * @example
     * ```ts
     * // The code below gets a worksheet by sheet id
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheet = activeSpreadsheet.getSheetBySheetId('sheetId');
     * ```
     */
    getSheetBySheetId(sheetId: string): FWorksheet | null {
        const worksheet = this._workbook.getSheetBySheetId(sheetId);
        if (!worksheet) {
            return null;
        }

        return this._injector.createInstance(FWorksheet, this, this._workbook, worksheet);
    }

    /**
     * Get a worksheet by sheet name.
     * @param name The name of the sheet to get.
     * @returns The worksheet with given sheet name
     * @example
     * ```ts
     * // The code below gets a worksheet by sheet name
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheet = activeSpreadsheet.getSheetByName('Sheet1');
     * ```
     */
    getSheetByName(name: string): FWorksheet | null {
        const worksheet = this._workbook.getSheetBySheetName(name);
        if (!worksheet) {
            return null;
        }

        return this._injector.createInstance(FWorksheet, this, this._workbook, worksheet);
    }

    /**
     * Sets the given worksheet to be the active worksheet in the workbook.
     * @param sheet The worksheet to set as the active worksheet.
     * @returns The active worksheet
     * @example
     * ```ts
     * // The code below sets the given worksheet to be the active worksheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheet = activeSpreadsheet.getSheetByName('Sheet1');
     * activeSpreadsheet.setActiveSheet(sheet);
     * ```
     */
    setActiveSheet(sheet: FWorksheet): FWorksheet {
        this._commandService.syncExecuteCommand(SetWorksheetActiveOperation.id, {
            unitId: this.id,
            subUnitId: sheet.getSheetId(),
        });

        return sheet;
    }

    /**
     * Inserts a new worksheet into the workbook.
     * Using a default sheet name. The new sheet becomes the active sheet
     * @param sheetName - (optional) The name of the new sheet
     * @returns The new sheet
     * @example
     * ```ts
     * // The code below inserts a new sheet into the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.insertSheet();
     *
     * // The code below inserts a new sheet into the workbook, using a custom name
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.insertSheet('MyNewSheet');
     * ```
     */
    insertSheet(sheetName?: string): FWorksheet {
        if (sheetName != null) {
            this._commandService.syncExecuteCommand(InsertSheetCommand.id, { sheet: { name: sheetName } });
        } else {
            this._commandService.syncExecuteCommand(InsertSheetCommand.id);
        }

        const unitId = this.id;
        const subUnitId = this._workbook.getSheets()[this._workbook.getSheets().length - 1].getSheetId();

        this._commandService.syncExecuteCommand(SetWorksheetActiveOperation.id, {
            unitId,
            subUnitId,
        });
        const worksheet = this._workbook.getActiveSheet();
        if (!worksheet) {
            throw new Error('No active sheet found');
        }

        return this._injector.createInstance(FWorksheet, this, this._workbook, worksheet);
    }

    /**
     * Deletes the specified worksheet.
     * @param sheet The worksheet to delete.
     * @example
     * ```ts
     * // The code below deletes the specified worksheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheet = activeSpreadsheet.getSheetByName('Sheet1');
     * activeSpreadsheet.deleteSheet(sheet);
     * ```
     */
    deleteSheet(sheet: FWorksheet): void {
        const unitId = this.id;
        const subUnitId = sheet.getSheetId();
        this._commandService.executeCommand(RemoveSheetCommand.id, {
            unitId,
            subUnitId,
        });
    }

    // #region editing
    /**
     * Undo the last action.
     * @returns A promise that resolves to true if the undo was successful, false otherwise.
     * @example
     * ```ts
     * // The code below undoes the last action
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.undo();
     * ```
     */
    undo(): Promise<boolean> {
        this._univerInstanceService.focusUnit(this.id);
        return this._commandService.executeCommand(UndoCommand.id);
    }

    /**
     * Redo the last undone action.
     * @returns A promise that resolves to true if the redo was successful, false otherwise.
     * @example
     * ```ts
     * // The code below redoes the last undone action
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.redo();
     * ```
     */
    redo(): Promise<boolean> {
        this._univerInstanceService.focusUnit(this.id);
        return this._commandService.executeCommand(RedoCommand.id);
    }

    /**
     * Callback for command execution.
     * @callback onBeforeCommandExecuteCallback
     * @param {ICommandInfo<ISheetCommandSharedParams>} command The command that was executed.
     */

    /**
     * Register a callback that will be triggered before invoking a command targeting the Univer sheet.
     * @param {onBeforeCommandExecuteCallback} callback the callback.
     * @returns A function to dispose the listening.
     * @example
     * ```ts
     * // The code below registers a callback that will be triggered before invoking a command targeting the Univer sheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.onBeforeCommandExecute((command) => {
     *    console.log('Command executed:', command);
     * });
     * ```
     */
    onBeforeCommandExecute(callback: CommandListener): IDisposable {
        return this._commandService.beforeCommandExecuted((command) => {
            if ((command as ICommandInfo<ISheetCommandSharedParams>).params?.unitId !== this.id) {
                return;
            }

            callback(command);
        });
    }

    /**
     * Callback for command execution.
     * @callback onCommandExecutedCallback
     * @param {ICommandInfo<ISheetCommandSharedParams>} command The command that was executed
     */

    /**
     * Register a callback that will be triggered when a command is invoked targeting the Univer sheet.
     * @param {onCommandExecutedCallback} callback the callback.
     * @returns A function to dispose the listening.
     * @example
     * ```ts
     * // The code below registers a callback that will be triggered when a command is invoked targeting the Univer sheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.onCommandExecuted((command) => {
     *   console.log('Command executed:', command);
     * });
     */
    onCommandExecuted(callback: CommandListener): IDisposable {
        return this._commandService.onCommandExecuted((command) => {
            if ((command as ICommandInfo<ISheetCommandSharedParams>).params?.unitId !== this.id) {
                return;
            }

            callback(command);
        });
    }

    /**
     * Callback for selection changes.
     *
     * @callback onSelectionChangeCallback
     * @param {IRange[]} selections The new selection.
     */

    /**
     * Register a callback that will be triggered when the selection changes.
     * @param {onSelectionChangeCallback} callback The callback.
     * @returns A function to dispose the listening
     */
    onSelectionChange(callback: (selections: IRange[]) => void): IDisposable {
        return toDisposable(
            this._selectionManagerService.selectionMoveEnd$.subscribe((selections) => {
                if (this._univerInstanceService.getCurrentUnitForType<Workbook>(UniverInstanceType.UNIVER_SHEET)!.getUnitId() !== this.id) {
                    return;
                }

                if (!selections?.length) {
                    callback([]);
                } else {
                    // TODO@wzhudev: filtered out ranges changes not other currently sheet
                    callback(selections!.map((s) => s.range));
                }
            })
        );
    }

    /**
     * Used to modify the editing permissions of the workbook. When the value is false, editing is not allowed.
     * @param {boolean} value  editable value want to set
     */
    setEditable(value: boolean): void {
        const instance = new WorkbookEditablePermission(this._workbook.getUnitId());
        const editPermissionPoint = this._permissionService.getPermissionPoint(instance.id);
        if (!editPermissionPoint) {
            this._permissionService.addPermissionPoint(instance);
        }
        this._permissionService.updatePermissionPoint(instance.id, value);
    }

    /**
     * Sets the active selection region for this sheet.
     * @param range The range to set as the active selection.
     */
    setActiveRange(range: FRange): void {
        // In theory, FRange should belong to a specific context, rather than getting the currently active sheet
        const sheet = this.getActiveSheet();
        const sheetId = range.getRange().sheetId || sheet.getSheetId();

        const worksheet = sheetId ? this._workbook.getSheetBySheetId(sheetId) : this._workbook.getActiveSheet(true);
        if (!worksheet) {
            throw new Error('No active sheet found');
        }

        // if the range is not in the current sheet, set the active sheet to the range's sheet
        if (worksheet.getSheetId() !== sheet.getSheetId()) {
            this.setActiveSheet(this._injector.createInstance(FWorksheet, this, this._workbook, worksheet));
        }

        const setSelectionOperationParams: ISetSelectionsOperationParams = {
            unitId: this.getId(),
            subUnitId: sheetId,

            selections: [range].map((r) => ({ range: r.getRange(), primary: getPrimaryForRange(r.getRange(), worksheet), style: null })),
        };

        this._commandService.syncExecuteCommand(SetSelectionsOperation.id, setSelectionOperationParams);
    }

    /**
     * Returns the selected range in the active sheet, or null if there is no active range.
     * @returns the active range
     */
    getActiveRange(): FRange | null {
        const activeSheet = this._workbook.getActiveSheet();
        const selections = this._selectionManagerService.getCurrentSelections();
        const active = selections.find((selection) => !!selection.primary);
        if (!active) {
            return null;
        }

        return this._injector.createInstance(FRange, this._workbook, activeSheet, active.range);
    }

    /**
     * Deletes the currently active sheet.
     * @example
     * ```ts
     * // The code below deletes the currently active sheet and stores the new active
     * // sheet in a variable
     * const sheet = univerAPI.getActiveWorkbook().deleteActiveSheet();
     * ```
     */
    deleteActiveSheet(): void {
        const sheet = this.getActiveSheet();
        this.deleteSheet(sheet);
    }

    /**
     * Duplicates the given worksheet.
     * @param {FWorksheet} sheet The worksheet to duplicate.
     * @example
     * ```ts
     * // The code below duplicates the given worksheet
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const activeSheet = activeSpreadsheet.getActiveSheet();
     * activeSpreadsheet.duplicateSheet(activeSheet);
     * ```
     */
    duplicateSheet(sheet: FWorksheet) {
        this._commandService.syncExecuteCommand(CopySheetCommand.id, {
            unitId: sheet.getWorkbook().getUnitId(),
            subUnitId: sheet.getSheetId(),
        });
    }

    /**
     * Duplicates the active sheet.
     * @example
     * ```ts
     * // The code below duplicates the active sheet
     *  const activeSpreadsheet = univerAPI.getActiveWorkbook();
     *  activeSpreadsheet.duplicateActiveSheet();
     * ```
     */
    duplicateActiveSheet(): void {
        const sheet = this.getActiveSheet();
        this.duplicateSheet(sheet);
    }

    /**
     * Get the number of sheets in the workbook.
     * @returns The number of sheets in the workbook
     * @example
     * ```ts
     * // The code below gets the number of sheets in the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const numSheets = activeSpreadsheet.getNumSheets();
     * ```
     */
    getNumSheets(): number {
        return this._workbook.getSheets().length;
    }

    /**
     * Get the locale of the workbook.
     * @returns {LocaleType} The locale of the workbook
     * @example
     * ```ts
     * // The code below gets the locale of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const locale = activeSpreadsheet.getLocale();
     * ```
     */
    getLocale(): LocaleType {
        return this._localeService.getCurrentLocale();
    }

    /**
     * Set the locale of the workbook.
     * @param {LocaleType} locale The locale to set
     * @example
     * ```ts
     * // The code below sets the locale of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.setLocale(LocaleType.EN_US);
     * ```
     */

    setLocale(locale: LocaleType): void {
        this._localeService.setLocale(locale);
    }

    /**
     * Get the URL of the workbook.
     * @returns {string} The URL of the workbook
     * @example
     * ```ts
     * // The code below gets the URL of the workbook
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const url = activeSpreadsheet.getUrl();
     * ```
     */
    getUrl(): string {
        return location.href;
    }

    /**
     * Move the sheet to the specified index.
     * @param {FWorksheet} sheet The sheet to move
     * @param {number} index The index to move the sheet to
     * @returns {Promise<boolean>} true if the sheet was moved, false otherwise
     * @example
     * ```ts
     * // The code below moves the sheet to the specified index
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * const sheet = activeSpreadsheet.getActiveSheet();
     * activeSpreadsheet.moveSheet(sheet, 1);
     * ```
     */
    async moveSheet(sheet: FWorksheet, index: number): Promise<boolean> {
        let sheetIndexVal = index;
        if (sheetIndexVal < 0) {
            sheetIndexVal = 0;
        } else if (sheetIndexVal > this._workbook.getSheets().length - 1) {
            sheetIndexVal = this._workbook.getSheets().length - 1;
        }
        return this._commandService.executeCommand(SetWorksheetOrderCommand.id, {
            unitId: sheet.getWorkbook().getUnitId(),
            order: sheetIndexVal,
            subUnitId: sheet.getSheetId(),
        });
    }

    /**
     * Move the active sheet to the specified index.
     * @param {number} index The index to move the active sheet to
     * @returns {Promise<boolean>} true if the sheet was moved, false otherwise
     * @example
     * ```ts
     * // The code below moves the active sheet to the specified index
     * const activeSpreadsheet = univerAPI.getActiveWorkbook();
     * activeSpreadsheet.moveActiveSheet(1);
     * ```
     */
    async moveActiveSheet(index: number) {
        const sheet = this.getActiveSheet();
        return this.moveSheet(sheet, index);
    }

    /**
     * Get the PermissionInstance.
     *
     * @returns {FPermission} - The PermissionInstance.
     */
    getPermission() {
        return this._injector.createInstance(FPermission);
    }
}
