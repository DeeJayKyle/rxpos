// Password field with an eye button to show what you typed (hidden again when the field loses focus for a while)
import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const PasswordInput = forwardRef(function PasswordInput({ className = '', ...props }, ref) {
  const [show, setShow] = useState(false);
  return (
    <span className={'pw-wrap ' + className}>
      <input ref={ref} {...props} type={show ? 'text' : 'password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} />
      <button type="button" className="pw-eye" tabIndex={-1} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}
        onPointerDown={(e) => e.preventDefault() /* keep the cursor in the field */} onClick={() => setShow((v) => !v)}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  );
});
