package com.myndshelf.drive

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Endereço e token do servidor, gravados pelo app (MyndShelfDriveModule). */
object DriveConfig {
  private const val PREFS = "myndshelf-drive"

  fun save(ctx: Context, url: String, token: String) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("url", url.trimEnd('/')).putString("token", token).apply()
  }

  fun clear(ctx: Context) {
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun load(ctx: Context): Pair<String, String>? {
    val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val url = p.getString("url", null) ?: return null
    val token = p.getString("token", null) ?: return null
    return url to token
  }
}

/** Um item do drive (contrato em packages/sync/src/protocol.ts). */
data class DriveItem(
  val id: String,
  val parentId: String,
  val isFolder: Boolean,
  val name: String,
  val size: Long,
  val mime: String?,
  val createdAt: Long,
  val contentVersion: Int,
) {
  companion object {
    fun from(o: JSONObject) = DriveItem(
      id = o.getString("id"),
      parentId = o.optString("parentId", DriveApi.ROOT),
      isFolder = o.optString("kind") == "folder",
      name = o.optString("name"),
      size = o.optLong("size", 0),
      mime = if (o.has("mime") && !o.isNull("mime")) o.getString("mime") else null,
      createdAt = o.optLong("createdAt", 0),
      contentVersion = o.optInt("contentVersion", 0),
    )
  }
}

class DriveException(message: String) : IOException(message)

/** Cliente de /api/drive/* com HttpURLConnection (sem dependências). */
class DriveApi(private val base: String, private val token: String) {
  companion object {
    const val ROOT = "root"

    fun from(ctx: Context): DriveApi? = DriveConfig.load(ctx)?.let { (u, t) -> DriveApi(u, t) }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8").replace("+", "%20")
  }

  private fun open(method: String, path: String): HttpURLConnection {
    val c = URL(base + path).openConnection() as HttpURLConnection
    c.requestMethod = method
    c.connectTimeout = 15_000
    c.readTimeout = 60_000
    c.setRequestProperty("authorization", "Bearer $token")
    return c
  }

  private fun check(c: HttpURLConnection) {
    val code = c.responseCode
    if (code in 200..299) return
    val msg = runCatching { c.errorStream?.bufferedReader()?.readText() }.getOrNull() ?: ""
    throw DriveException(if (code == 401) "O servidor recusou o token." else "O servidor respondeu $code $msg")
  }

  private fun json(c: HttpURLConnection): JSONObject {
    check(c)
    return c.inputStream.use { JSONObject(it.bufferedReader().readText()) }
  }

  private fun sendJson(method: String, path: String, body: JSONObject): JSONObject {
    val c = open(method, path)
    c.doOutput = true
    c.setRequestProperty("content-type", "application/json")
    c.outputStream.use { it.write(body.toString().toByteArray()) }
    return json(c)
  }

  private fun sendFile(method: String, path: String, file: File, mime: String, name: String?): JSONObject {
    val c = open(method, path)
    c.doOutput = true
    c.setFixedLengthStreamingMode(file.length())
    c.setRequestProperty("content-type", mime)
    if (name != null) c.setRequestProperty("x-file-name", enc(name))
    c.outputStream.use { out -> file.inputStream().use { it.copyTo(out) } }
    return json(c)
  }

  fun list(): List<DriveItem> {
    val arr = json(open("GET", "/api/drive/items")).getJSONArray("items")
    return (0 until arr.length()).map { DriveItem.from(arr.getJSONObject(it)) }
  }

  fun download(id: String, dest: File) {
    val c = open("GET", "/api/files/${enc(id)}")
    check(c)
    dest.parentFile?.mkdirs()
    val tmp = File(dest.path + ".download")
    c.inputStream.use { input: InputStream -> FileOutputStream(tmp).use { input.copyTo(it) } }
    if (!tmp.renameTo(dest)) throw DriveException("não deu para gravar ${dest.name}")
  }

  fun createFile(parent: String, name: String, file: File, mime: String) =
    DriveItem.from(sendFile("POST", "/api/drive/files?parent=${enc(parent)}", file, mime, name))

  fun replaceFile(id: String, file: File, mime: String) = DriveItem.from(sendFile("PUT", "/api/drive/files/${enc(id)}", file, mime, null))

  fun mkdir(name: String) = DriveItem.from(sendJson("POST", "/api/drive/folders", JSONObject().put("name", name)))

  fun patch(id: String, name: String? = null, parent: String? = null): DriveItem {
    val body = JSONObject()
    if (name != null) body.put("name", name)
    if (parent != null) body.put("parentId", parent)
    return DriveItem.from(sendJson("PATCH", "/api/drive/items/${enc(id)}", body))
  }

  fun delete(id: String) {
    val c = open("DELETE", "/api/drive/items/${enc(id)}")
    check(c)
    c.inputStream.close()
  }
}
