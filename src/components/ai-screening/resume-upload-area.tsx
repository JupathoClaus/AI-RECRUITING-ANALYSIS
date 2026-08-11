'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Upload, FileText, X } from 'lucide-react'

const ACCEPTED_FORMATS = '.pdf,.docx'
const MAX_SIZE_MB = 10

interface Props {
  onUpload: (file: File) => void
  uploading: boolean
  disabled?: boolean
}

export function ResumeUploadArea({ onUpload, uploading, disabled }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'docx'].includes(ext)) return 'Only PDF and DOCX files are accepted.'
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) return 'Unsupported file format.'
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `File exceeds ${MAX_SIZE_MB} MB limit.`
    return null
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const err = validate(file)
    if (err) { setValidationError(err); setSelectedFile(null); return }
    setValidationError(null)
    setSelectedFile(file)
  }

  const handleUpload = () => {
    if (!selectedFile) return
    onUpload(selectedFile)
  }

  const clear = () => {
    setSelectedFile(null)
    setValidationError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Resume</div>
        {!selectedFile ? (
          <div
            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Click to select a resume file
            </p>
            <p className="text-xs text-muted-foreground">
              PDF or DOCX, max {MAX_SIZE_MB} MB
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              onChange={handleFileChange}
              className="hidden"
              aria-label="Upload resume file"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 p-3 border rounded-lg">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={clear} disabled={uploading} aria-label="Remove file">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {validationError && <p className="text-sm text-destructive">{validationError}</p>}
        {selectedFile && !uploading && (
          <Button onClick={handleUpload} className="w-full" disabled={disabled}>
            Upload Resume
          </Button>
        )}
        {uploading && (
          <Button disabled className="w-full">
            <span className="animate-pulse">Uploading...</span>
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
