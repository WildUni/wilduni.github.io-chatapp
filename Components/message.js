function setup() {
    return {}
}

export default async () => ({
    props: ["username", "messageContent", "avatarUrl", "published", "isOwnMessage", "showName", "showAvatar"],
    setup,
    template: await fetch(new URL("./message.html", import.meta.url)).then((r) =>
        r.text(),
    ),
});
