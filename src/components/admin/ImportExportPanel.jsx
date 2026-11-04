import { useState } from 'react'
import { fetchAdminPages, formatCsv, parseGuestCsv } from '../../lib/adminData'
import { supabase } from '../../lib/supabase'

const GUEST_COLUMNS = [
  ['full_name', 'Guest name'],
  ['household_name', 'Household'],
  ['invited_count', 'Invited'],
  ['checked_in_count', 'Checked in'],
  ['remaining_count', 'Remaining'],
  ['attendance_status', 'Attendance status'],
  ['is_active', 'Active'],
  ['notes', 'Notes'],
]

const ATTENDANCE_COLUMNS = GUEST_COLUMNS.filter(([field]) => field !== 'notes')
const HISTORY_COLUMNS = [
  ['guest_name', 'Guest name'],
  ['household_name', 'Household'],
  ['people_admitted', 'People admitted'],
  ['usher_name', 'Staff member'],
  ['checked_in_at', 'Checked in at'],
  ['reversed_at', 'Reversed at'],
  ['reversed_by_name', 'Reversed by'],
]

function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function ImportExportPanel() {
  const [parsed, setParsed] = useState(null)
  const [fileError, setFileError] = useState('')
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState('')
  const [message, setMessage] = useState('')
  const [importResults, setImportResults] = useState([])

  async function selectFile(event) {
    const file = event.target.files?.[0]
    setParsed(null)
    setFileError('')
    setMessage('')
    setImportResults([])
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFileError('CSV files must be 5 MB or smaller.')
      return
    }
    try {
      const result = parseGuestCsv(await file.text())
      if (result.rows.length > 500) result.fatalError = 'Imports are limited to 500 rows per file.'
      setParsed(result)
    } catch {
      setFileError('This file could not be read as CSV.')
    }
  }

  async function commitImport() {
    if (!parsed || parsed.fatalError) return
    const candidates = parsed.rows.filter((row) => row.errors.length === 0 && !row.duplicate)
    if (!candidates.length) {
      setMessage('There are no valid, non-duplicate rows to import.')
      return
    }
    if (!window.confirm(`Import ${candidates.length} new guest record${candidates.length === 1 ? '' : 's'}? Existing guests will not be overwritten.`)) return

    setImporting(true)
    setMessage('')
    try {
      const { data, error } = await supabase.rpc('admin_import_guests', {
        p_rows: candidates.map((row) => row.data),
      })
      if (error) {
        setMessage('Import result could not be confirmed. Refresh the guest list before retrying; duplicate checks prevent overwriting existing records.')
        return
      }
      const created = (data || []).filter((row) => row.status === 'created').length
      const duplicate = (data || []).filter((row) => row.status === 'duplicate').length
      const invalid = (data || []).filter((row) => row.status === 'invalid').length
      const previewInvalid = parsed.rows.filter((row) => row.errors.length).length
      const previewDuplicate = parsed.rows.filter((row) => !row.errors.length && row.duplicate).length
      setMessage(`Import complete: ${created} created, ${duplicate + previewDuplicate} skipped as duplicates, ${invalid + previewInvalid} invalid.`)
      setImportResults([
        ...parsed.rows
          .filter((row) => row.errors.length || row.duplicate)
          .map((row) => ({
            row_number: row.rowNumber,
            status: row.errors.length ? 'invalid' : 'duplicate',
            message: row.errors.join(' ') || 'Duplicate within the CSV; skipped.',
          })),
        ...(data || []).map((result, index) => ({
          ...result,
          row_number: candidates[index]?.rowNumber || result.row_number,
        })),
      ])
      setParsed(null)
    } catch {
      setMessage('Import result could not be confirmed. Refresh the guest list before retrying; duplicate checks prevent overwriting existing records.')
    } finally {
      setImporting(false)
    }
  }

  async function exportData(type) {
    setExporting(type)
    setMessage('')
    try {
      let filename
      let content
      if (type === 'guests' || type === 'attendance') {
        const { rows } = await fetchAdminPages(
          (name, args) => supabase.rpc(name, args),
          'admin_list_guests',
          { p_query: '', p_active: 'all', p_attendance: 'all' },
        )
        const exportRows = rows.map((row) => ({
          ...row,
          remaining_count: row.invited_count - row.checked_in_count,
          attendance_status: row.checked_in_count === 0
            ? 'Not checked in'
            : row.checked_in_count >= row.invited_count
              ? 'Fully checked in'
              : 'Partially checked in',
          is_active: row.is_active ? 'Active' : 'Inactive',
        }))
        filename = `wedding-${type}-${today()}.csv`
        content = formatCsv(exportRows, type === 'guests' ? GUEST_COLUMNS : ATTENDANCE_COLUMNS)
      } else {
        const { rows } = await fetchAdminPages(
          (name, args) => supabase.rpc(name, args),
          'admin_list_checkin_history',
        )
        filename = `wedding-check-in-history-${today()}.csv`
        content = formatCsv(rows, HISTORY_COLUMNS)
      }
      downloadCsv(filename, content)
      setMessage(`${type === 'history' ? 'Check-in history' : type === 'guests' ? 'Guest list' : 'Attendance summary'} exported.`)
    } catch {
      setMessage('Export failed. You may need to filter the dataset or retry after checking the connection.')
    } finally {
      setExporting('')
    }
  }

  const candidates = parsed?.rows.filter((row) => row.errors.length === 0 && !row.duplicate).length || 0

  return (
    <section aria-labelledby="import-export-heading">
      <h2 id="import-export-heading" className="font-serif text-2xl text-beige">Import &amp; export</h2>
      <p className="mt-1 text-sm text-white/55">Review guest data before adding it. Imports never overwrite existing records.</p>

      <div className="mt-5 rounded-xl border border-white/10 bg-deepnavy p-4 sm:p-5">
        <h3 className="font-semibold text-beige">Import guest CSV</h3>
        <p className="mt-1 text-sm text-white/55">Required columns: <code>full_name</code>, <code>invited_count</code>. Optional: <code>household_name</code>, <code>notes</code>. Maximum 500 rows and 5 MB.</p>
        <label className="mt-4 block text-sm text-white/70">Select CSV file
          <input className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-4 file:py-3 file:font-semibold file:text-midnight" type="file" accept=".csv,text/csv" onChange={selectFile} />
        </label>
        {fileError && <p className="mt-3 text-sm text-red-200" role="alert">{fileError}</p>}
        {parsed?.fatalError && <p className="mt-3 text-sm text-red-200" role="alert">{parsed.fatalError}</p>}
        {parsed && !parsed.fatalError && (
          <>
            {parsed.unexpectedHeaders?.length > 0 && <p className="mt-3 text-xs text-amber-200">Unrecognized columns will be ignored: {parsed.unexpectedHeaders.join(', ')}</p>}
            <p className="mt-4 text-sm text-white/70" role="status">{candidates} row(s) ready; {parsed.rows.filter((row) => row.errors.length || row.duplicate).length} need attention.</p>
            <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/10">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="sticky top-0 bg-midnight text-white/60"><tr><th className="px-3 py-2">CSV row</th><th className="px-3 py-2">Guest</th><th className="px-3 py-2">Household</th><th className="px-3 py-2">Invited</th><th className="px-3 py-2">Preview</th></tr></thead>
                <tbody className="divide-y divide-white/10">{parsed.rows.map((row) => {
                  const issue = row.errors.join(' ') || (row.duplicate ? 'Duplicate within this file; skipped.' : 'Ready to import')
                  return <tr key={row.rowNumber}><td className="px-3 py-2">{row.rowNumber}</td><td className="px-3 py-2">{row.data.full_name}</td><td className="px-3 py-2">{row.data.household_name || '—'}</td><td className="px-3 py-2">{row.data.invited_count}</td><td className={`px-3 py-2 ${row.errors.length || row.duplicate ? 'text-amber-200' : 'text-emerald-200'}`}>{issue}</td></tr>
                })}</tbody>
              </table>
            </div>
            <button type="button" className="btn-primary mt-4 w-auto" disabled={!candidates || importing} onClick={commitImport}>{importing ? 'Importing…' : `Confirm import (${candidates})`}</button>
            <button type="button" className="btn-ghost ml-2" disabled={importing} onClick={() => setParsed(null)}>Cancel</button>
          </>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-deepnavy p-4 sm:p-5">
        <h3 className="font-semibold text-beige">Download reports</h3>
        <p className="mt-1 text-sm text-white/55">Exports use current database records, are limited to 5,000 rows, and neutralize spreadsheet formulas.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {[
            ['guests', 'Guest list CSV'],
            ['attendance', 'Attendance summary CSV'],
            ['history', 'Check-in history CSV'],
          ].map(([type, label]) => (
            <button key={type} type="button" className="btn-ghost" disabled={Boolean(exporting)} onClick={() => exportData(type)}>
              {exporting === type ? 'Preparing…' : label}
            </button>
          ))}
        </div>
      </div>
      {message && <p className="mt-4 rounded-lg border border-white/10 p-3 text-sm" role="status">{message}</p>}
      {importResults.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[460px] text-left text-xs">
            <thead className="bg-white/5 text-white/55"><tr><th className="px-3 py-2">CSV row</th><th className="px-3 py-2">Result</th><th className="px-3 py-2">Details</th></tr></thead>
            <tbody className="divide-y divide-white/10">{importResults.map((result, index) => <tr key={`${result.row_number}-${index}`}><td className="px-3 py-2">{result.row_number}</td><td className="px-3 py-2">{result.status}</td><td className="px-3 py-2">{result.message}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
