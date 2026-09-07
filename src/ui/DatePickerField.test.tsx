import React from 'react';
import { render, screen, userEvent } from '@testing-library/react-native';
import { DatePickerField } from './DatePickerField';

describe('DatePickerField', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 5)); // Saturday — the strip anchors to "now"
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls onChange when a strip day is tapped', async () => {
    const value = new Date(2026, 8, 5); // Saturday
    const onChange = jest.fn();
    render(<DatePickerField value={value} onChange={onChange} />);

    await userEvent.press(screen.getByLabelText(new Date(2026, 8, 3).toDateString()));
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 8, 3));
  });

  it('opens the month grid on "Full month" and lets a day be picked there', async () => {
    const value = new Date(2026, 8, 5);
    const onChange = jest.fn();
    render(<DatePickerField value={value} onChange={onChange} />);

    await userEvent.press(screen.getByText('Full month ▾'));
    expect(screen.getByText('September 2026')).toBeTruthy();

    await userEvent.press(screen.getByLabelText(new Date(2026, 8, 20).toDateString()));
    expect(onChange).toHaveBeenCalledWith(new Date(2026, 8, 20));
  });

  it('opens and closes the month/year jump index', async () => {
    const value = new Date(2026, 8, 5);
    render(<DatePickerField value={value} onChange={jest.fn()} />);

    await userEvent.press(screen.getByText('Full month ▾'));
    await userEvent.press(screen.getByText('Jump to month ›'));
    expect(screen.getByText('2026')).toBeTruthy();

    await userEvent.press(screen.getByText('Close jump ›'));
    expect(screen.getByText('September 2026')).toBeTruthy();
  });
});
