import React, { useState } from "react";
import { expect, fn, userEvent } from "storybook/test";
import FormField from "./FormField.jsx";

export default {
    title: "Components/FormField",
    component: FormField,
    args: {
        id: "shopName",
        label: "Nazwa sklepu",
        placeholder: "MójSklep",
        onChange: fn(),
    },
    decorators: [
        (Story) => (
            <div className="w-full max-w-sm">
                <Story />
            </div>
        ),
    ],
};

export const Default = {
    play: async ({ canvas, args }) => {
        await userEvent.type(canvas.getByLabelText("Nazwa sklepu"), "x");
        await expect(args.onChange).toHaveBeenCalled();
    },
};

export const WithValue = {
    args: { value: "MojSklep24" },
};

export const WithError = {
    args: {
        value: "Mój Sklep!",
        error: "Dozwolone znaki: A-Za-z0-9",
    },
};

export const Password = {
    args: {
        id: "password",
        label: "Hasło",
        type: "password",
        placeholder: "********",
        value: "tajnehaslo",
    },
};
