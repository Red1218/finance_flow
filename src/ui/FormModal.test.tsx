import React from 'react';
import { Text } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';
import { FormModal } from './FormModal';
import { Button, Input } from './primitives';

describe('FormModal', () => {
  it('invokes onClose when the backdrop is pressed', async () => {
    const onClose = jest.fn();
    render(
      <FormModal visible onClose={onClose}>
        <Text>Sheet content</Text>
      </FormModal>
    );

    await userEvent.press(screen.getByTestId('form-modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClose when the sheet surface itself is pressed', async () => {
    const onClose = jest.fn();
    render(
      <FormModal visible onClose={onClose}>
        <Text>Sheet content</Text>
      </FormModal>
    );

    await userEvent.press(screen.getByTestId('form-modal-sheet'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets a TextInput inside the sheet receive text without closing the modal', async () => {
    const onClose = jest.fn();
    const onChangeText = jest.fn();
    render(
      <FormModal visible onClose={onClose}>
        <Input placeholder="Amount" value="" onChangeText={onChangeText} />
      </FormModal>
    );

    await userEvent.type(screen.getByPlaceholderText('Amount'), '500');
    expect(onChangeText).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('lets a button inside the sheet fire its own onPress without closing the modal', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    render(
      <FormModal visible onClose={onClose}>
        <Button title="Save budget" onPress={onSave} />
      </FormModal>
    );

    await userEvent.press(screen.getByText('Save budget'));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders nothing when not visible', () => {
    render(
      <FormModal visible={false} onClose={jest.fn()}>
        <Text>Sheet content</Text>
      </FormModal>
    );
    expect(screen.queryByText('Sheet content')).toBeNull();
  });
});
