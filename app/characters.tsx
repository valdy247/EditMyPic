import React, { useEffect, useState } from "react";
import {
  Alert, FlatList, Image, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import { File, Paths } from "expo-file-system";

type Character = {
  id: string;
  name: string;
  image: string;
};

const STORAGE = "editmypic:characters";

export default function CharactersScreen() {
  const router = useRouter();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE)
      .then((data) => {
        if (data) setCharacters(JSON.parse(data));
      })
      .catch(() => Alert.alert("Error", "No se pudo cargar la biblioteca."));
  }, []);

  async function addCharacter() {
    if (!name.trim()) {
      Alert.alert("Nombre necesario", "Escribe el nombre del personaje.");
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });

    if (result.canceled || !result.assets?.[0]) return;

    try {
      const asset = result.assets[0];
      const id = Date.now().toString();
      const extension = asset.mimeType === "image/png" ? "png" : "jpg";
      const destination = new File(Paths.document, `character-${id}.${extension}`);

      new File(asset.uri).copy(destination);

      const updated = [
        { id, name: name.trim(), image: destination.uri },
        ...characters,
      ];

      await AsyncStorage.setItem(STORAGE, JSON.stringify(updated));
      setCharacters(updated);
      setName("");
    } catch {
      Alert.alert("Error", "No se pudo guardar el personaje.");
    }
  }

  function removeCharacter(character: Character) {
    Alert.alert("Eliminar personaje", `¿Eliminar a ${character.name}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const updated = characters.filter((c) => c.id !== character.id);
          await AsyncStorage.setItem(STORAGE, JSON.stringify(updated));
          setCharacters(updated);
        },
      },
    ]);
  }

  return (
    <View style={s.page}>
      <TouchableOpacity onPress={() => router.back()}>
        <Text style={s.back}>← Volver</Text>
      </TouchableOpacity>

      <Text style={s.title}>Biblioteca de personajes</Text>
      <Text style={s.subtitle}>Guarda tus personajes para futuras escenas.</Text>

      <TextInput
        style={s.input}
        placeholder="Nombre: Uvo, Papayita, Banano..."
        placeholderTextColor="#a69aab"
        value={name}
        onChangeText={setName}
      />

      <TouchableOpacity style={s.button} onPress={addCharacter}>
        <Text style={s.buttonText}>+ Añadir personaje y fotografía</Text>
      </TouchableOpacity>

      <FlatList
        data={characters}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={{ paddingTop: 24, paddingBottom: 50 }}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          <Text style={s.subtitle}>Aún no tienes personajes guardados.</Text>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <Image source={{ uri: item.image }} style={s.image} />
            <Text style={s.name}>{item.name}</Text>
            <TouchableOpacity onPress={() => removeCharacter(item)}>
              <Text style={s.delete}>Eliminar</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#130d1c", padding: 22, paddingTop: 55 },
  back: { color: "#f5a3c5", fontSize: 16, marginBottom: 24 },
  title: { color: "#fff", fontSize: 27, fontWeight: "800" },
  subtitle: { color: "#c8baca", marginTop: 8, marginBottom: 16 },
  input: {
    backgroundColor: "#302036", borderRadius: 14, padding: 16,
    color: "#fff", fontSize: 16, marginTop: 12,
  },
  button: {
    backgroundColor: "#e5689b", borderRadius: 14, padding: 16,
    alignItems: "center", marginTop: 14,
  },
  buttonText: { color: "#fff", fontWeight: "800" },
  card: {
    flex: 1, backgroundColor: "#302036", borderRadius: 16,
    padding: 10, marginBottom: 12,
  },
  image: { width: "100%", aspectRatio: 1, borderRadius: 12 },
  name: { color: "#fff", fontSize: 16, fontWeight: "700", marginTop: 10 },
  delete: { color: "#ff9cae", marginTop: 10, marginBottom: 5 },
});
