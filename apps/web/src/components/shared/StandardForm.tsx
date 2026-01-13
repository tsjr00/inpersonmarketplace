'use client';

import React, { useState, useCallback } from 'react';

interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'textarea' | 'select' | 'number';
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    custom?: (value: string) => string | null;
  };
}

interface StandardFormProps {
  fields: FormField[];
  onSubmit: (data: Record<string, string>) => Promise<void>;
  submitLabel?: string;
  loading?: boolean;
  initialValues?: Record<string, string>;
  clearOnSuccess?: boolean;
}

interface FormErrors {
  [key: string]: string | null;
}

export default function StandardForm({
  fields,
  onSubmit,
  submitLabel = 'Submit',
  loading = false,
  initialValues = {},
  clearOnSuccess = true,
}: StandardFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    fields.forEach((field) => {
      initial[field.name] = initialValues[field.name] || '';
    });
    return initial;
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateField = useCallback((field: FormField, value: string): string | null => {
    // Required validation
    if (field.required && !value.trim()) {
      return `${field.label} is required`;
    }

    if (!value.trim()) return null;

    // Email validation
    if (field.type === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Please enter a valid email address';
      }
    }

    // Min length validation
    if (field.validation?.minLength && value.length < field.validation.minLength) {
      return `${field.label} must be at least ${field.validation.minLength} characters`;
    }

    // Max length validation
    if (field.validation?.maxLength && value.length > field.validation.maxLength) {
      return `${field.label} must be no more than ${field.validation.maxLength} characters`;
    }

    // Pattern validation
    if (field.validation?.pattern && !field.validation.pattern.test(value)) {
      return `${field.label} format is invalid`;
    }

    // Custom validation
    if (field.validation?.custom) {
      return field.validation.custom(value);
    }

    return null;
  }, []);

  const validateAllFields = useCallback((): boolean => {
    const newErrors: FormErrors = {};
    let isValid = true;

    fields.forEach((field) => {
      const error = validateField(field, values[field.name] || '');
      newErrors[field.name] = error;
      if (error) isValid = false;
    });

    setErrors(newErrors);
    return isValid;
  }, [fields, values, validateField]);

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setSubmitSuccess(false);
    setSubmitError(null);

    // Clear error on change if field was touched
    if (touched[name]) {
      const field = fields.find((f) => f.name === name);
      if (field) {
        const error = validateField(field, value);
        setErrors((prev) => ({ ...prev, [name]: error }));
      }
    }
  };

  const handleBlur = (name: string) => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const field = fields.find((f) => f.name === name);
    if (field) {
      const error = validateField(field, values[name] || '');
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitSuccess(false);
    setSubmitError(null);

    // Mark all fields as touched
    const allTouched: Record<string, boolean> = {};
    fields.forEach((field) => {
      allTouched[field.name] = true;
    });
    setTouched(allTouched);

    if (!validateAllFields()) {
      return;
    }

    try {
      await onSubmit(values);
      setSubmitSuccess(true);
      if (clearOnSuccess) {
        const cleared: Record<string, string> = {};
        fields.forEach((field) => {
          cleared[field.name] = '';
        });
        setValues(cleared);
        setTouched({});
        setErrors({});
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const renderField = (field: FormField) => {
    const hasError = touched[field.name] && errors[field.name];
    const baseInputClasses = `w-full px-4 py-3 text-base border rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      hasError
        ? 'border-red-500 focus:ring-red-500'
        : 'border-gray-300 focus:border-blue-500'
    }`;

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            id={field.name}
            name={field.name}
            value={values[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            placeholder={field.placeholder}
            disabled={loading}
            rows={4}
            className={baseInputClasses}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${field.name}-error` : undefined}
          />
        );

      case 'select':
        return (
          <select
            id={field.name}
            name={field.name}
            value={values[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            disabled={loading}
            className={baseInputClasses}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${field.name}-error` : undefined}
          >
            <option value="">{field.placeholder || `Select ${field.label}`}</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      default:
        return (
          <input
            type={field.type}
            id={field.name}
            name={field.name}
            value={values[field.name] || ''}
            onChange={(e) => handleChange(field.name, e.target.value)}
            onBlur={() => handleBlur(field.name)}
            placeholder={field.placeholder}
            disabled={loading}
            className={baseInputClasses}
            aria-invalid={!!hasError}
            aria-describedby={hasError ? `${field.name}-error` : undefined}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {fields.map((field) => (
        <div key={field.name} className="space-y-1">
          <label
            htmlFor={field.name}
            className="block text-sm font-medium text-gray-700"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
          {renderField(field)}
          {touched[field.name] && errors[field.name] && (
            <p
              id={`${field.name}-error`}
              className="text-sm text-red-600 mt-1"
              role="alert"
            >
              {errors[field.name]}
            </p>
          )}
        </div>
      ))}

      {submitError && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
          role="alert"
        >
          {submitError}
        </div>
      )}

      {submitSuccess && (
        <div
          className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm"
          role="status"
        >
          Form submitted successfully!
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3 text-base font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[48px]"
      >
        {loading ? (
          <span className="flex items-center justify-center">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></span>
            Submitting...
          </span>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}
