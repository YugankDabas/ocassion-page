import { isSafeHref } from '../../../contracts';
import { TextInput } from '../../../components/ui';

/** Link input with the same safety rules as the API (https URL, /path or #anchor). */
export function HrefInput({
  label,
  value,
  onChange,
  placeholder = 'https://www.gyftr.com/… , /path or #section',
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <TextInput
      label={label}
      value={value}
      placeholder={placeholder}
      hint={hint}
      maxLength={2048}
      onChange={onChange}
      error={value && !isSafeHref(value) ? 'Enter a full https:// URL, a path starting with /, or a #section-anchor' : undefined}
    />
  );
}
