"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

export interface JobSalaryFieldsValue {
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
}

interface JobSalaryFieldsProps {
  value: JobSalaryFieldsValue
  onChange: (next: JobSalaryFieldsValue) => void
}

const CURRENCIES = [
  "UGX",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "KES",
  "NGN",
  "ZAR",
  "GHS",
  "TZS",
  "RWF",
  "CAD",
  "AUD",
  "INR",
  "CNY",
  "AED",
  "SGD",
  "CHF",
  "SEK",
  "NOK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "PHP",
  "MYR",
  "THB",
  "IDR",
  "VND",
  "KRW",
  "NZD",
  "BRL",
  "MXN",
  "SAR",
  "QAR",
  "KWD",
  "EGP",
  "MAD",
]

const NONE = "__none__"

/**
 * Shared salary inputs used by both the Create Job and Edit Job flows so the
 * two experiences stay consistent (same fields, same canonical names:
 * salaryMin / salaryMax / salaryCurrency).
 *
 * Salary is optional — blank fields are left as undefined (persisted as null)
 * rather than coerced to 0.
 */
export function JobSalaryFields({ value, onChange }: JobSalaryFieldsProps) {
  const salaryMin = value.salaryMin ?? undefined
  const salaryMax = value.salaryMax ?? undefined
  const salaryCurrency = value.salaryCurrency ?? undefined

  const options = React.useMemo(() => {
    if (salaryCurrency && !CURRENCIES.includes(salaryCurrency)) {
      return [salaryCurrency, ...CURRENCIES]
    }
    return CURRENCIES
  }, [salaryCurrency])

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">Salary</label>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label htmlFor="job-salary-min" className="text-xs text-muted-foreground">
            Minimum Salary
          </label>
          <Input
            id="job-salary-min"
            type="number"
            min={0}
            placeholder="e.g. 3000000"
            value={salaryMin ?? ""}
            onChange={(e) =>
              onChange({ ...value, salaryMin: e.target.value ? parseInt(e.target.value, 10) : undefined })
            }
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="job-salary-max" className="text-xs text-muted-foreground">
            Maximum Salary
          </label>
          <Input
            id="job-salary-max"
            type="number"
            min={0}
            placeholder="e.g. 5000000"
            value={salaryMax ?? ""}
            onChange={(e) =>
              onChange({ ...value, salaryMax: e.target.value ? parseInt(e.target.value, 10) : undefined })
            }
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Currency</label>
          <Select
            value={salaryCurrency ?? NONE}
            onValueChange={(v) => onChange({ ...value, salaryCurrency: v === NONE ? undefined : v })}
          >
            <SelectTrigger aria-label="Currency">
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No currency</SelectItem>
              {options.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}