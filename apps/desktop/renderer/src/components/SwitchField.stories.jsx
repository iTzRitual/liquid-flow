import React from "react";
import { expect, fn } from "storybook/test";
import SwitchField from "./SwitchField.jsx";

export default {
    title: "Components/SwitchField",
    component: SwitchField,
    args: {
        id: "savePwd",
        label: "Zapamiętaj hasło",
        onCheckedChange: fn(),
    },
};

export const Off = {
    args: { checked: false },
    play: async ({ canvas, args }) => {
        await canvas.getByRole("switch").click();
        await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
    },
};

export const On = {
    args: { checked: true },
    play: async ({ canvas, args }) => {
        await canvas.getByRole("switch").click();
        await expect(args.onCheckedChange).toHaveBeenCalledWith(false);
    },
};
