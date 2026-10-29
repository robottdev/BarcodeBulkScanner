# Barcode list

A phone-friendly page that builds a barcode list you can paste into Excel, Google Sheets, Numbers, or a text file. Nothing is uploaded — decoding happens in the browser.

There are two ways to scan:

- **Photo roll** — take or choose as many photos as you need, then read them all at once. Useful in a tight spot where you only have time to take pictures.
- **One at a time** — point the camera at a single barcode and it is added as soon as it is read. Use this when a photo of many labels might miss one.

## Use it on an iPhone

The camera button and the copy button need the page to be opened from an `https://` address (a normal hosted link). Add it to the Home Screen if you want it full screen.

1. Open the page in Safari.

**Photo roll**

2. Leave **Photo roll** selected.
3. Tap **Take photos**. A live viewfinder stays open, so you can snap a roll of pictures without leaving the page. Tap the shutter for each one, then **Done**. If the live camera cannot open, **Open camera app** uses the normal camera instead, one photo at a time.
4. Or tap **Choose photos** and select several from the library.
5. When you are out of the tight spot, tap **Read**. The page outlines each barcode and lists the values in photo order.
6. Check the list. Tap a row to spot that barcode on its photo, correct a misread, or remove a false one.
7. Tap **Copy**. Paste into a spreadsheet column, or into Notepad.

**One at a time**

2. Tap **One at a time**, then **Start scanning**.
3. Fill the box with one barcode. When it is read, it is added to the list and you can move to the next. Holding still does not add the same code again. Move off it, then aim at it again, if you need a second copy.
4. Tap **Stop**, check the list, and tap **Copy**.

Turn on **Include type** when you also want the symbology (Code 128, QR Code, EAN-13, …) in a second column.

If a code starts with zero and Excel drops that zero, select the column, format it as **Text**, and paste again. The copy is sent as text so Excel usually keeps the zeros. A 12-digit UPC-A is listed as 13 digits, with a 0 in front of the digits printed on the package.

## Run it locally

```bash
npm install
npm run dev
```

Open the Network address Vite prints. On a phone over plain `http`, taking a photo still works; if **Copy** cannot reach the clipboard, the list box is selected so you can copy it from the share menu.

## Publish

```bash
npm install
npm run build
npm start
```

`npm start` serves the built page on `0.0.0.0` and the `PORT` assigned by the host. Photos are still decoded in the browser.

### Railway

Connect this repository and deploy the branch that contains the app. Railway installs dependencies, runs `npm run build`, then `npm start`. The public URL is HTTPS, so the camera and Copy button work in Safari.

If the service settings already contain a start command, set it to `npm start` or clear it so the repository command is used. A command such as `vite` or `vite preview` listens on the wrong port, and Railway reports that the application failed.
